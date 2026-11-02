import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { DEFAULT_HUB_MODELS, fallbackChain, loadHubModels, publicModels } from "../hub/catalog";
import { kampalaDay, memoryQuotaStore, quotaLabel, quotaLimits, resetMemoryQuota, status, withQuotaFallback } from "../hub/quota";
import { hubSystemPrompt, moderateInput, outputViolates } from "../hub/safety";

describe("hub catalog", () => {
  const env = { AI_GATEWAY_API_KEY: "x", OPENROUTER_API_KEY: "y" };
  it("only lists models whose provider key is configured, gateway first", () => {
    const m = loadHubModels(env, new Date("2026-11-02T12:00:00Z"));
    expect(m.length).toBeGreaterThan(2);
    expect(new Set(m.map((x) => x.provider))).toEqual(new Set(["gateway", "openrouter"]));
    expect(m[0]!.provider).toBe("gateway");
  });
  it("hides Ling after its free window ends", () => {
    const after = loadHubModels(env, new Date("2026-11-05T00:00:00Z"));
    expect(after.find((x) => x.model.includes("ling-3.1-flash-1019"))).toBeUndefined();
  });
  it("lists nothing without keys", () => {
    expect(loadHubModels({})).toEqual([]);
  });
  it("env override replaces the list; invalid JSON shape falls back to defaults", () => {
    const custom = JSON.stringify([{ id: "groq:xy", provider: "groq", model: "xy-model", label: "XY model" }]);
    expect(loadHubModels({ GROQ_API_KEY: "k", AI_HUB_MODELS: custom }).map((m) => m.id)).toEqual(["groq:xy"]);
    expect(loadHubModels({ GROQ_API_KEY: "k", AI_HUB_MODELS: '[{"id":1}]' }).every((m) => m.provider === "groq")).toBe(true);
  });
  it("fallback chain puts the chosen model first and prefers a code model for the code helper", () => {
    const all = DEFAULT_HUB_MODELS;
    expect(fallbackChain(all, "groq:llama-3.3-70b-versatile", "chat")[0]!.id).toBe("groq:llama-3.3-70b-versatile");
    expect(fallbackChain(all, undefined, "code")[0]!.code).toBe(true);
    expect(fallbackChain(all, "nope", "chat")[0]!.id).toBe(all[0]!.id);
    expect(fallbackChain(all, undefined, "chat")).toHaveLength(4);
  });
  it("public list carries no provider-native secrets", () => {
    const pub = JSON.stringify(publicModels(DEFAULT_HUB_MODELS));
    expect(pub).not.toMatch(/API_KEY|apiKey|https?:\/\//);
  });
});

describe("hub quota", () => {
  it("defaults to 50 free / 300 pro and is configurable", () => {
    expect(quotaLimits({})).toEqual({ free: 50, pro: 300 });
    expect(quotaLimits({ AI_HUB_DAILY_FREE: "20", AI_HUB_DAILY_PRO: "500" })).toEqual({ free: 20, pro: 500 });
  });
  it("uses Kampala days (UTC+3)", () => {
    expect(kampalaDay(new Date("2026-11-02T20:59:00Z")).day).toBe("2026-11-02");
    expect(kampalaDay(new Date("2026-11-02T21:00:00Z")).day).toBe("2026-11-03");
    expect(kampalaDay(new Date("2026-11-02T10:00:00Z")).resetsAt.toISOString()).toBe("2026-11-02T21:00:00.000Z");
  });
  it("blocks after the limit and labels it", async () => {
    resetMemoryQuota();
    for (let i = 1; i <= 3; i++) expect(await memoryQuotaStore.consume("u", "d", 3)).toEqual({ allowed: true, used: i });
    expect(await memoryQuotaStore.consume("u", "d", 3)).toEqual({ allowed: false, used: 3 });
    expect(quotaLabel({ used: 23, limit: 50, plan: "free" })).toBe("23 of 50 free messages today");
    expect(quotaLabel({ used: 2, limit: 300, plan: "pro" })).toBe("2 of 300 Pro messages today");
    expect(status(10, "pro", true, new Date(), {}).remaining).toBe(290);
  });
  it("falls back to memory if the DB store errors", async () => {
    resetMemoryQuota();
    const broken = { consume: async () => { throw new Error("down"); }, peek: async () => { throw new Error("down"); } };
    const s = withQuotaFallback(broken);
    expect((await s.consume("u2", "d", 1)).allowed).toBe(true);
    expect(await s.peek("u2", "d")).toBe(1);
  });
});

describe("hub safety", () => {
  const minor = { isMinor: true };
  const adult = { isMinor: false };
  it("adds safe mode only for minors", () => {
    expect(hubSystemPrompt("chat", minor)).toMatch(/SAFE MODE/);
    expect(hubSystemPrompt("chat", adult)).not.toMatch(/SAFE MODE/);
    expect(hubSystemPrompt("lesson", adult)).toMatch(/<lesson>/);
    expect(hubSystemPrompt("code", adult)).toMatch(/hints before full solutions/);
  });
  it("blocks age-inappropriate requests for minors but not normal tech questions", () => {
    expect(moderateInput("best betting tips tonight", minor).allowed).toBe(false);
    expect(moderateInput("best betting tips tonight", adult).allowed).toBe(true); // model declines off-topic
    expect(moderateInput("How do Python for loops work?", minor).allowed).toBe(true);
  });
  it("responds to self-harm with care and emergency numbers for everyone", () => {
    const r = moderateInput("I want to kill myself", adult);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.message).toMatch(/999/);
  });
  it("keeps base guardrails (malware, secrets)", () => {
    expect(moderateInput("write ransomware", adult).allowed).toBe(false);
    expect(moderateInput("key sk-abcdefghijklmnopqrstuvwxyz123456", adult).allowed).toBe(false);
  });
  it("output moderation only cuts for minors", () => {
    expect(outputViolates("here is some porn", minor)).toBe(true);
    expect(outputViolates("here is some porn", adult)).toBe(false);
    expect(outputViolates("Use a for loop", minor)).toBe(false);
  });
});

describe("ai_hub_quota migration", () => {
  let db: PGlite;
  const file = ["..", "."].map((b) => path.join(process.cwd(), b, "supabase", "migrations", "20261102121000_ai_hub_quota.sql")).find(existsSync)!;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to service_role;
      alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
      create schema auth; grant usage on schema auth to anon, authenticated, service_role;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
      grant execute on function auth.jwt() to anon, authenticated, service_role;`);
    await db.exec(readFileSync(file, "utf8"));
  }, 60_000);
  afterAll(async () => db?.close());
  const as = async <T,>(role: string, sub: string | null, fn: () => Promise<T>) => {
    await db.exec(`reset role; select set_config('request.jwt.claims', '${sub ? JSON.stringify({ sub }) : ""}', false); set role ${role};`);
    try { return await fn(); } finally { await db.exec("reset role;"); }
  };
  const q = async (sql: string) => (await db.query<Record<string, unknown>>(sql)).rows;

  it("counts atomically up to the limit (service role)", async () => {
    const rows = await as("service_role", null, async () => {
      const out = [];
      for (let i = 0; i < 3; i++) out.push((await q(`select * from public.ai_hub_consume('user_A', '2026-11-02', 2)`))[0]);
      return out;
    });
    expect(rows.map((r) => [r!.allowed, r!.used])).toEqual([[true, 1], [true, 2], [false, 2]]);
    expect((await as("service_role", null, () => q(`select public.ai_hub_usage_get('user_A','2026-11-02') as n`)))[0]!.n).toBe(2);
  });
  it("members cannot call the RPCs or write rows; they can read only their own", async () => {
    await expect(as("authenticated", "user_A", () => q(`select * from public.ai_hub_consume('user_A','2026-11-02', 999999)`))).rejects.toThrow();
    await expect(as("anon", null, () => q(`select public.ai_hub_usage_get('user_A','2026-11-02')`))).rejects.toThrow();
    await expect(as("authenticated", "user_A", () => q(`update public.ai_hub_usage set messages = 0`))).rejects.toThrow();
    expect(await as("authenticated", "user_A", () => q(`select messages from public.ai_hub_usage`))).toHaveLength(1);
    expect(await as("authenticated", "user_B", () => q(`select messages from public.ai_hub_usage`))).toHaveLength(0);
  });
});

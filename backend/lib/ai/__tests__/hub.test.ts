import { describe, expect, it } from "vitest";
import { DEFAULT_HUB_MODELS, fallbackChain, loadHubModels, publicModels } from "../hub/catalog";
import { backendQuotaStore, kampalaDay, memoryQuotaStore, quotaLabel, resetMemoryQuota, toQuotaStatus, type BackendQuotaApi } from "../hub/quota";
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

describe("hub quota (backend ai_usage API)", () => {
  it("uses Kampala days (UTC+3)", () => {
    expect(kampalaDay(new Date("2026-11-02T20:59:00Z")).day).toBe("2026-11-02");
    expect(kampalaDay(new Date("2026-11-02T21:00:00Z")).day).toBe("2026-11-03");
    expect(kampalaDay(new Date("2026-11-02T10:00:00Z")).resetsAt.toISOString()).toBe("2026-11-02T21:00:00.000Z");
  });
  it("maps my_ai_quota() to the hub status and labels it", () => {
    const q = toQuotaStatus({ plan: "pro", limit_requests: 200, used_requests: 10, limit_tokens: 400000, used_tokens: 5000, enabled: true }, true);
    expect(q).toMatchObject({ used: 10, limit: 200, remaining: 190, plan: "pro", promoActive: true });
    expect(toQuotaStatus(null).plan).toBe("free");
    expect(toQuotaStatus({ plan: "free", limit_requests: 20, used_requests: 25 }).remaining).toBe(0);
    expect(quotaLabel({ used: 3, limit: 20, plan: "free" })).toBe("3 of 20 free messages today");
    expect(quotaLabel({ used: 2, limit: 200, plan: "pro" })).toBe("2 of 200 Pro messages today");
  });
  it("reserves via reserveAi, reports refusals with the backend's numbers, commits once", async () => {
    let used = 19;
    const commits: unknown[] = [];
    const api: BackendQuotaApi = {
      reserve: async (u, feature, est) => {
        expect([u, feature, est]).toEqual(["user_1", "hub.chat", 1500]);
        if (used >= 20) return { allowed: false, reason: "quota", plan: "free", limit_requests: 20, used_requests: used };
        used++;
        return { allowed: true, usage_id: "uuid-1", plan: "free", remaining_requests: 20 - used };
      },
      commit: async (...a) => void commits.push(a),
      myQuota: async () => ({ plan: "free", limit_requests: 20, used_requests: used }),
    };
    const store = backendQuotaStore(api, "user_1", false);
    const ok = await store.reserve("hub.chat", 1500);
    expect(ok).toMatchObject({ allowed: true, usageId: "uuid-1", quota: { used: 20, limit: 20, remaining: 0 } });
    await store.commit("uuid-1", "ok", { model: "m", input_tokens: 5, output_tokens: 7 });
    expect(commits).toEqual([["uuid-1", "ok", { model: "m", input_tokens: 5, output_tokens: 7 }]]);
    const no = await store.reserve("hub.chat", 1500);
    expect(no).toMatchObject({ allowed: false, reason: "quota", quota: { used: 20, limit: 20, plan: "free" } });
  });
  it("commit never throws (the stream is already sent)", async () => {
    const store = backendQuotaStore({ reserve: async () => ({ allowed: true }), commit: async () => { throw new Error("down"); }, myQuota: async () => null }, "u", false);
    await expect(store.commit("x", "error")).resolves.toBeUndefined();
  });
  it("in-memory dev store mirrors the seeded limits", async () => {
    resetMemoryQuota();
    const s = memoryQuotaStore("u", "free", false);
    for (let i = 1; i <= 20; i++) expect((await s.reserve("hub.chat", 1)).allowed).toBe(true);
    expect(await s.reserve("hub.chat", 1)).toMatchObject({ allowed: false, reason: "quota", quota: { used: 20, limit: 20 } });
    expect((await memoryQuotaStore("u", "pro", true).peek()).limit).toBe(200);
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

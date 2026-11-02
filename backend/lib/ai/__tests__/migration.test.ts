import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Applies supabase/migrations/*_ai_features.sql to an in-process Postgres
 * (PGlite + pgvector) with minimal Supabase stubs (roles, auth.jwt(), realtime
 * schema), then exercises RLS exactly as PostgREST would: SET ROLE + JWT claims.
 */

const MIGRATION = readFileSync(path.join(process.cwd(), "supabase", "migrations", "20261102120000_ai_features.sql"), "utf8");

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;
  grant all on all tables in schema public to service_role;
  alter default privileges in schema public grant all on tables to service_role;
  alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated;
  alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role;
  create schema auth; grant usage on schema auth to anon, authenticated, service_role;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant execute on function auth.jwt() to anon, authenticated, service_role;
  create schema realtime; grant usage on schema realtime to authenticated, service_role;
  create table realtime.messages (id bigserial primary key, topic text not null, extension text not null, payload jsonb);
  alter table realtime.messages enable row level security;
  grant select, insert on realtime.messages to authenticated; grant usage on sequence realtime.messages_id_seq to authenticated;
  create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
  grant execute on function realtime.topic() to authenticated;
`;

let db: PGlite;

async function as<T>(role: "anon" | "authenticated" | "service_role", sub: string | null, fn: () => Promise<T>): Promise<T> {
  await db.exec(`reset role; select set_config('request.jwt.claims', '${sub ? JSON.stringify({ sub, role }) : ""}', false); set role ${role};`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role;");
  }
}
const q = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows;
const vec = (hot: number) => `[${Array.from({ length: 1536 }, (_, i) => (i === hot ? 1 : 0)).join(",")}]`;

beforeAll(async () => {
  db = new PGlite({ extensions: { vector } });
  await db.exec(SUPABASE_STUBS);
  await db.exec(MIGRATION);
}, 60_000);
afterAll(async () => db?.close());

describe("ai_features migration", () => {
  it("applies cleanly and creates the expected objects", async () => {
    const tables = await q(`select tablename from pg_tables where schemaname='public' order by 1`);
    expect(tables.map((t) => t.tablename)).toEqual(
      expect.arrayContaining(["ai_documents", "ai_conversations", "ai_messages", "ai_rate_limits", "whiteboards", "whiteboard_members"]),
    );
    const rls = await q(`select relname, relrowsecurity from pg_class where relname in ('ai_documents','ai_conversations','ai_messages','ai_rate_limits','whiteboards','whiteboard_members')`);
    expect(rls.every((r) => r.relrowsecurity === true)).toBe(true);
  });

  it("functions are default-deny: no EXECUTE for PUBLIC, minimal grants only", async () => {
    const rows = await q(`
      select p.proname, n.nspname,
             has_function_privilege('anon', p.oid, 'execute') as anon_x,
             has_function_privilege('authenticated', p.oid, 'execute') as auth_x,
             exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') as public_x
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where (n.nspname = 'ai_private') or (n.nspname = 'public' and p.proname in ('match_ai_documents','ai_rate_limit_hit'))`);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const r of rows) expect(r.public_x, `${r.nspname}.${r.proname} PUBLIC`).toBe(false);
    const anonAllowed = rows.filter((r) => r.anon_x).map((r) => r.proname);
    expect(anonAllowed).toEqual(["match_ai_documents"]);
    const authAllowed = rows.filter((r) => r.auth_x).map((r) => String(r.proname)).sort();
    expect(authAllowed).toEqual(["board_from_topic", "board_role", "can_edit_board", "can_view_board", "is_board_owner", "match_ai_documents", "uid"]);
  });

  it("match_ai_documents ranks by cosine similarity and anon can read knowledge", async () => {
    await as("service_role", null, () =>
      q(`insert into public.ai_documents (doc_id, source, title, url, content, embedding, embedding_model) values
          ('faq:a','faq','A','/a','alpha', $1, 'test'), ('faq:b','faq','B','/b','beta', $2, 'test')`, [vec(0), vec(1)]),
    );
    const rows = await as("anon", null, () => q(`select doc_id, similarity from public.match_ai_documents($1, 5, 0.1)`, [vec(1)]));
    expect(rows[0]).toMatchObject({ doc_id: "faq:b" });
    expect(Number(rows[0]!.similarity)).toBeCloseTo(1, 5);
    expect(rows.find((r) => r.doc_id === "faq:a")).toBeUndefined(); // orthogonal → below threshold
  });

  it("anon/authenticated cannot write knowledge", async () => {
    await expect(
      as("authenticated", "user_A", () => q(`insert into public.ai_documents (doc_id, source, title, content, embedding, embedding_model) values ('x','x','x','x',$1,'t')`, [vec(2)])),
    ).rejects.toThrow();
  });

  it("conversation history is private per Clerk user", async () => {
    const [conv] = await as("authenticated", "user_A", () => q(`insert into public.ai_conversations (title) values ('mine') returning id, user_id`));
    expect(conv!.user_id).toBe("user_A");
    await as("authenticated", "user_A", () =>
      q(`insert into public.ai_messages (conversation_id, role, content) values ($1,'user','hello')`, [conv!.id]),
    );
    const seenByB = await as("authenticated", "user_B", () => q(`select * from public.ai_conversations`));
    expect(seenByB).toHaveLength(0);
    const msgsByB = await as("authenticated", "user_B", () => q(`select * from public.ai_messages`));
    expect(msgsByB).toHaveLength(0);
    // B cannot inject a message into A's conversation, even claiming A's id.
    await expect(
      as("authenticated", "user_B", () => q(`insert into public.ai_messages (conversation_id, role, content) values ($1,'assistant','pwned')`, [conv!.id])),
    ).rejects.toThrow();
    await expect(
      as("authenticated", "user_B", () =>
        q(`insert into public.ai_messages (conversation_id, user_id, role, content) values ($1,'user_A','assistant','pwned')`, [conv!.id]),
      ),
    ).rejects.toThrow();
    // anon sees nothing at all
    await expect(as("anon", null, () => q(`select * from public.ai_conversations`))).rejects.toThrow();
    const mine = await as("authenticated", "user_A", () => q(`select content from public.ai_messages`));
    expect(mine.map((m) => m.content)).toEqual(["hello"]);
  });

  it("rate limit counts per window and is service-role only", async () => {
    const hits = await as("service_role", null, async () => {
      const out = [];
      for (let i = 0; i < 3; i++) out.push((await q(`select * from public.ai_rate_limit_hit('user:A', 2, 600)`))[0]);
      return out;
    });
    expect(hits.map((h) => h!.allowed)).toEqual([true, true, false]);
    expect(hits[2]!.remaining).toBe(0);
    await expect(as("anon", null, () => q(`select * from public.ai_rate_limit_hit('x', 100, 600)`))).rejects.toThrow();
    await expect(as("authenticated", "user_A", () => q(`select * from public.ai_rate_limit_hit('x', 100, 600)`))).rejects.toThrow();
  });

  it("whiteboards: owner, editor, viewer and stranger permissions", async () => {
    const [board] = await as("authenticated", "owner_1", () => q(`insert into public.whiteboards (title) values ('Team plan') returning id, version`));
    const id = board!.id as string;
    await as("authenticated", "owner_1", () =>
      q(`insert into public.whiteboard_members (board_id, user_id, role) values ($1,'editor_1','editor'), ($1,'viewer_1','viewer')`, [id]),
    );
    // editor can update the scene; version bumps
    const upd = await as("authenticated", "editor_1", () =>
      q(`update public.whiteboards set scene = '{"elements":[{"id":"1"}],"appState":{}}' where id = $1 returning version`, [id]),
    );
    expect(upd[0]!.version).toBe(2);
    // editor cannot steal ownership
    await expect(as("authenticated", "editor_1", () => q(`update public.whiteboards set owner_id = 'editor_1' where id = $1`, [id]))).rejects.toThrow();
    // viewer can read but not write
    expect(await as("authenticated", "viewer_1", () => q(`select id from public.whiteboards where id = $1`, [id]))).toHaveLength(1);
    const vUpd = await as("authenticated", "viewer_1", () => q(`update public.whiteboards set title = 'hacked' where id = $1 returning id`, [id]));
    expect(vUpd).toHaveLength(0);
    // viewer cannot add members; stranger sees nothing
    await expect(
      as("authenticated", "viewer_1", () => q(`insert into public.whiteboard_members (board_id, user_id) values ($1,'friend')`, [id])),
    ).rejects.toThrow();
    expect(await as("authenticated", "stranger", () => q(`select id from public.whiteboards`))).toHaveLength(0);
    // only the owner can delete
    expect(await as("authenticated", "editor_1", () => q(`delete from public.whiteboards where id = $1 returning id`, [id]))).toHaveLength(0);
  });

  it("realtime: members receive, only editors broadcast, strangers blocked", async () => {
    const [board] = await as("authenticated", "rt_owner", () => q(`insert into public.whiteboards (title) values ('RT') returning id`));
    const id = board!.id as string;
    await as("authenticated", "rt_owner", () => q(`insert into public.whiteboard_members (board_id, user_id, role) values ($1,'rt_viewer','viewer')`, [id]));
    await db.exec(`select set_config('realtime.topic', 'whiteboard:${id}', false)`);
    const send = (sub: string, ext: string) =>
      as("authenticated", sub, () => q(`insert into realtime.messages (topic, extension, payload) values ($1, $2, '{}') returning id`, [`whiteboard:${id}`, ext]));
    await expect(send("rt_owner", "broadcast")).resolves.toHaveLength(1);
    await expect(send("rt_viewer", "presence")).resolves.toHaveLength(1);
    await expect(send("rt_viewer", "broadcast")).rejects.toThrow();
    await expect(send("stranger", "presence")).rejects.toThrow();
    const recv = await as("authenticated", "rt_viewer", () => q(`select id from realtime.messages`));
    expect(recv.length).toBeGreaterThan(0);
    const recvStranger = await as("authenticated", "stranger", () => q(`select id from realtime.messages`));
    expect(recvStranger).toHaveLength(0);
    // malformed topics never match
    await db.exec(`select set_config('realtime.topic', 'whiteboard:not-a-uuid', false)`);
    await expect(send("rt_owner", "broadcast")).rejects.toThrow();
  });
});

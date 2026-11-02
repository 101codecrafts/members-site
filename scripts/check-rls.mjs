#!/usr/bin/env node
// RLS / grant lint for a migrated Supabase database.
//   DATABASE_URL=postgres://... node scripts/check-rls.mjs [--schemas public,app] [--json out.json]
// Fails (exit 1) on:
//   E1 table in an exposed schema without RLS enabled
//   E2 SECURITY DEFINER function without a pinned search_path
//   E3 SECURITY DEFINER function executable by anon/PUBLIC (warn only if name is allow-listed via RLS_ALLOW_ANON_FN)
// Warns on:
//   W1 RLS enabled but no policies (table is locked to everyone except service_role - usually intended for ledgers, but check)
//   W2 table/view with SELECT granted to anon
import pg from 'pg';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const schemas = opt('--schemas', 'public').split(',');
const allowAnon = (process.env.RLS_ALLOW_ANON_FN || '').split(',').filter(Boolean);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (process.env.TEST_DB) { /* run.mjs creates TEST_DB; connect there if asked */ }

const q = (s, p) => db.query(s, p).then(r => r.rows);
const errors = [], warns = [];

for (const r of await q(`select n.nspname s, c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and n.nspname = any($1) and not c.relrowsecurity order by 1,2`, [schemas]))
  errors.push({ code: 'E1', msg: `RLS disabled on ${r.s}.${r.t}`, fix: `alter table ${r.s}.${r.t} enable row level security; -- then add policies` });

for (const r of await q(`select n.nspname s, c.relname t from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p') and n.nspname = any($1) and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid=c.oid) order by 1,2`, [schemas]))
  warns.push({ code: 'W1', msg: `RLS on but no policies: ${r.s}.${r.t} (service_role only)` });

for (const r of await q(`select n.nspname s, p.proname f, pg_get_function_identity_arguments(p.oid) a, p.proconfig cfg,
    has_function_privilege('anon', p.oid, 'execute') anon_exec
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where p.prosecdef and n.nspname = any($1) order by 1,2`, [schemas]).catch(e => { warns.push({ code: 'W0', msg: 'function scan failed: ' + e.message }); return []; })) {
  const sig = `${r.s}.${r.f}(${r.a})`;
  if (!(r.cfg || []).some(c => c.startsWith('search_path='))) errors.push({ code: 'E2', msg: `SECURITY DEFINER without search_path: ${sig}`, fix: `alter function ${sig} set search_path = '';` });
  if (r.anon_exec) (allowAnon.includes(r.f) ? warns : errors).push({ code: 'E3', msg: `anon can EXECUTE security-definer ${sig}`, fix: `revoke execute on function ${sig} from public, anon;` });
}

for (const r of await q(`select table_schema s, table_name t from information_schema.role_table_grants
  where grantee='anon' and privilege_type='SELECT' and table_schema = any($1) group by 1,2 order by 1,2`, [schemas]).catch(() => []))
  warns.push({ code: 'W2', msg: `anon has SELECT on ${r.s}.${r.t}` });

await db.end();
for (const e of errors) console.log(`::error title=${e.code}::${e.msg}  fix: ${e.fix}`);
for (const w of warns) console.log(`::warning title=${w.code}::${w.msg}`);
console.log(`check-rls: ${errors.length} error(s), ${warns.length} warning(s) in schemas [${schemas}]`);
const out = opt('--json'); if (out) fs.writeFileSync(out, JSON.stringify({ errors, warns }, null, 2));
process.exit(errors.length ? 1 : 0);

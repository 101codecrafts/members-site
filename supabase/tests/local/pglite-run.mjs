// Local migration + RLS test runner on PGlite (Postgres compiled to WASM), for sandboxes with no Postgres server.
// Mirrors supabase/tests/run.mjs: shim + every migration + seed, then the *.test.mjs suites.
//   node run.mjs <supabase dir> [--only=<file substring>] [--migrate-only]
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const root = process.argv[2];
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
const pgl = new PGlite({ extensions: { pg_trgm, pgcrypto } });
await pgl.waitReady;
// node-postgres-like adapter
const db = {
  async query(sql, params) {
    if (params && params.length) return await pgl.query(sql, params);
    const r = await pgl.exec(sql);
    return r[r.length - 1] || { rows: [] };
  },
};
await pgl.exec(`create schema if not exists extensions; create role postgres superuser; create role supabase_admin;`).catch(() => {});
const files = [join(root, 'tests/local/00_supabase_shim.sql'),
  ...readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort().map((f) => join(root, 'migrations', f)),
  join(root, 'seed.sql')];
for (const f of files) {
  try { await pgl.exec(readFileSync(f, 'utf8')); console.log('applied ', f.replace(root + '/', '')); }
  catch (e) { console.error('FAILED  ', f, '\n ', e.message, e.where || '', 'pos', e.position); process.exit(1); }
}
if (process.argv.includes('--migrate-only')) process.exit(0);
const tests = [];
for (const f of readdirSync(join(root, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort((a, b) => (a === 'rls.test.mjs' ? -1 : b === 'rls.test.mjs' ? 1 : a.localeCompare(b)))) {
  const mod = await import(join(root, 'tests', f));
  if (only && !f.includes(only) && f !== 'rls.test.mjs') continue;
  tests.push(...mod.tests.map((t) => ({ ...t, file: f })));
}
let pass = 0, fail = 0;
for (const t of tests) {
  if (only && !t.file.includes(only)) continue;
  try { await t.run(db); pass++; console.log('  ok  ', t.name); }
  catch (e) { fail++; console.log('  FAIL', t.name, '\n      ', e.message, e.where ? e.where.split('\n')[0] : ''); }
  finally { try { await pgl.exec('rollback'); } catch (e) {} try { await pgl.exec('reset role'); } catch (e) {} }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

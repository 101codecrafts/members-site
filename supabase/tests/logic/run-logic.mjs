#!/usr/bin/env node
// Round 12 logic: money / state-machine INVARIANT suite. Kept OUT of supabase/tests/*.test.mjs on purpose: each check
// asserts the invariant the product promises; a failing check is a COUNTEREXAMPLE (a real defect), not a broken test.
// Exit code is 0 always; read the HOLDS / COUNTEREXAMPLE lines (and logic-results.json).
//   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres node supabase/tests/logic/run-logic.mjs
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const base = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres';
const dbName = process.env.TEST_DB ?? 'ccx_logic';

const admin = new pg.Client({ connectionString: base });
await admin.connect();
await admin.query(`drop database if exists ${dbName} with (force)`);
await admin.query(`create database ${dbName}`);
await admin.end();
const url = new URL(base); url.pathname = `/${dbName}`;
const db = new pg.Client({ connectionString: url.toString() });
await db.connect();
const files = [join(root, 'tests', 'local', '00_supabase_shim.sql'),
  ...readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort().map((f) => join(root, 'migrations', f)),
  join(root, 'seed.sql')];
for (const f of files) await db.query(readFileSync(f, 'utf8'));
console.log(`applied ${files.length} files`);

const results = [];
for (const f of readdirSync(here).filter((f) => f.endsWith('.inv.mjs')).sort()) {
  const mod = await import(join(here, f));
  for (const t of mod.tests) {
    let status = 'HOLDS', detail = '';
    try { await t.run(db); } catch (e) { status = e.counterexample ? 'COUNTEREXAMPLE' : 'ERROR'; detail = e.message + (e.where ? ' @ ' + e.where.split('\n')[0] : ''); }
    finally { await db.query('rollback').catch(() => {}); await db.query('reset role').catch(() => {}); }
    results.push({ id: t.id, name: t.name, status, detail });
    console.log(`  ${status.padEnd(14)} ${t.id} ${t.name}${detail ? '\n                 ' + detail : ''}`);
  }
}
writeFileSync(process.env.LOGIC_OUT ?? join(here, 'logic-results.json'), JSON.stringify(results, null, 1));
console.log(`\n${results.filter((r) => r.status === 'HOLDS').length} hold, ${results.filter((r) => r.status === 'COUNTEREXAMPLE').length} counterexamples, ${results.filter((r) => r.status === 'ERROR').length} errors`);
await db.end();

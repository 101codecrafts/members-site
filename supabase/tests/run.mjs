#!/usr/bin/env node
// Applies the local Supabase shim + every migration + seed to a fresh scratch
// database, then runs the RLS / business-rule suite.
//
//   DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres node supabase/tests/run.mjs
//
// Creates and drops a database named $TEST_DB (default ccx_test).
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const base = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5432/postgres';
const dbName = process.env.TEST_DB ?? 'ccx_test';
const onlyMigrate = process.argv.includes('--migrate-only');

async function main() {
  const admin = new pg.Client({ connectionString: base });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();

  const url = new URL(base);
  url.pathname = `/${dbName}`;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();

  const files = [
    join(here, 'local', '00_supabase_shim.sql'),
    ...readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort().map((f) => join(root, 'migrations', f)),
    join(root, 'seed.sql'),
  ];
  for (const f of files) {
    try {
      await db.query(readFileSync(f, 'utf8'));
      console.log(`applied  ${f.replace(root + '/', '')}`);
    } catch (e) {
      console.error(`FAILED   ${f}\n  ${e.message}\n  ${e.where ?? ''}\n  position: ${e.position ?? '-'}`);
      process.exit(1);
    }
  }
  if (onlyMigrate) { await db.end(); return; }

  const { tests } = await import('./rls.test.mjs');
  let pass = 0, fail = 0;
  for (const t of tests) {
    try {
      await t.run(db);
      pass++;
      console.log(`  ok   ${t.name}`);
    } catch (e) {
      fail++;
      console.log(`  FAIL ${t.name}\n       ${e.message}${e.where ? '\n       ' + e.where.split('\n')[0] : ''}`);
    } finally {
      await db.query('rollback').catch(() => {});
      await db.query('reset role').catch(() => {});
    }
  }
  console.log(`\n${pass} passed, ${fail} failed, ${tests.length} total`);
  await db.end();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

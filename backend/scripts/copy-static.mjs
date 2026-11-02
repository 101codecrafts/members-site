#!/usr/bin/env node
// Copies the static front end (owned by the front-end workstream, repo root)
// into backend/public so ONE Vercel project serves pages + /api on one origin.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const pub = join(here, '..', 'public');
mkdirSync(pub, { recursive: true });
for (const entry of ['index.html', 'dashboard.html', 'admin.html', 'css', 'js', 'assets', 'compare']) {
  const src = join(root, entry);
  if (existsSync(src)) cpSync(src, join(pub, entry), { recursive: true });
}
console.log('static front end copied to backend/public');

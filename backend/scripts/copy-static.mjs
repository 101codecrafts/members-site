#!/usr/bin/env node
// Copies the static front end (owned by the front-end workstream, repo root)
// into backend/public so ONE Vercel project serves pages + /api on one origin.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const pub = join(here, '..', 'public');
mkdirSync(pub, { recursive: true });
// every page + its static folders (src/, tools/, tokens/ are build inputs, not served)
const SKIP = new Set(['backend', 'supabase', 'docs', 'src', 'tools', 'tokens', 'compare', 'node_modules', '.git', '.github', 'vercel.json', 'package.json', 'README.md', 'LICENSE']);
const entries = existsSync(join(root, 'index.html')) ? readdirSync(root).filter(e => !SKIP.has(e) && !e.startsWith('.')) : [];
for (const entry of entries) {
  const src = join(root, entry);
  if (existsSync(src)) cpSync(src, join(pub, entry), { recursive: true });
}
console.log('static front end copied to backend/public');

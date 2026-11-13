// Design-system ratchet (round 13). Counts, per hand-written stylesheet, the values DESIGN.md says not to write:
//   hex   raw colour literals (#abc / #aabbcc …)            -> use a role token (var(--text), var(--surface-1) …)
//   off4  px spacing (padding/margin/gap/inset) not on the 4-pt grid (2px hairline offsets included)
//   rad   raw px border-radius values (r14: corners come from --radius-card / -control / -inner / -pill / -round; 999px+ pills exempt)
// The counts may only go DOWN: a file above its baseline fails; a new file must be 0/0 unless listed.
// usage: node tools/ds/lint.mjs            -> report, exit 1 on regression
//        node tools/ds/lint.mjs --update   -> rewrite tools/ds/baseline.json (only after a deliberate clean-up)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP = /^(bundle-|theme-dark\.css$|tokens\.css$|.*\.fit\.css$)/;   // generated files and static-mockup nudges
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const RAD = /\bborder(?:-[a-z]+)*-radius\s*:\s*([^;{}]+)/g;
const SP = /\b(?:padding|margin|gap|row-gap|column-gap|inset)(?:-[a-z-]+)?\s*:\s*([^;{}]+)/g;
export function scan(css) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const hex = (css.match(HEX) || []).length;
  let off4 = 0;
  for (const m of css.matchAll(SP)) for (const p of m[1].matchAll(/(-?\d*\.?\d+)px/g)) { const v = Math.abs(parseFloat(p[1])); if (v && v % 4) off4++; }
  let rad = 0;
  for (const m of css.matchAll(RAD)) for (const p of m[1].matchAll(/(\d*\.?\d+)px/g)) { const v = parseFloat(p[1]); if (v && v < 999) rad++; }
  return { hex, off4, rad };
}
export function lint() {
  const dir = path.join(root, 'css'); const base = JSON.parse(fs.readFileSync(path.join(root, 'tools/ds/baseline.json'), 'utf8'));
  const now = {}, bad = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.css') && !SKIP.test(f)).sort()) {
    now[f] = scan(fs.readFileSync(path.join(dir, f), 'utf8'));
    const b = base.files[f] || { hex: 0, off4: 0, rad: 0 };
    for (const k of ['hex', 'off4', 'rad']) if (b[k] !== undefined && now[f][k] > b[k]) bad.push(`${f}: ${k} ${now[f][k]} > baseline ${b[k]}`);
  }
  return { now, bad, base };
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { now, bad } = lint();
  if (process.argv.includes('--update')) {
    const tot = Object.values(now).reduce((a, v) => ({ hex: a.hex + v.hex, off4: a.off4 + v.off4, rad: a.rad + v.rad }), { hex: 0, off4: 0, rad: 0 });
    fs.writeFileSync(path.join(root, 'tools/ds/baseline.json'), JSON.stringify({ $note: 'design-system ratchet: counts may only go down (DESIGN.md "Do\'s and Don\'ts")', total: tot, files: now }, null, 1) + '\n');
    console.log('baseline updated', tot);
  } else {
    if (bad.length) { console.error('DESIGN-SYSTEM RATCHET FAILED\n' + bad.join('\n')); process.exit(1); }
    console.log('design-system ratchet ok:', Object.keys(now).length, 'stylesheets');
  }
}

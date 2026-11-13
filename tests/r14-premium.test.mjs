// r14 premium look ("soft brutalism", founder 13 Nov 2026): css/r14-premium.css is live-only, token-only, loaded last on
// every page (end of bundle-theme.css), and the glyph canvas / ticker strip / code horizon stay retired.
// node --test tests/r14-premium.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scan } from '../tools/ds/lint.mjs';
const rd = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const css = rd('css/r14-premium.css').replace(/\/\*[\s\S]*?\*\//g, '');
const split = (sel) => { const out = []; let d = 0, cur = ''; for (const ch of sel) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };

test('r14-premium.css: every rule is live-only (?static=1 stays the 0 px mockup)', () => {
  const sels = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((s) => s && !s.startsWith('@') && !/^(from|to|\d+%)/.test(s));
  assert.ok(sels.length > 30);
  for (const s of sels) for (const part of split(s)) assert.match(part.trim(), /^html(:root)?(\[[^\]]+\])?(\.[a-z-]+)*:not\(\.static\)/, 'unscoped: ' + part);
});

test('r14-premium.css: tokens only (no hex, 4-pt spacing, radius through --radius-* tokens)', () => {
  assert.deepEqual(scan(css), { hex: 0, off4: 0, rad: 0 });
  for (const m of css.matchAll(/border(?:-[a-z]+)*-radius\s*:\s*([^;}!]+)/g)) assert.match(m[1].trim(), /^(var\(--radius-[a-z]+\)|0)$/, 'radius: ' + m[1]);
  for (const t of ['--radius-card', '--radius-control', '--radius-pill', '--radius-round']) assert.ok(css.includes(t + ':'), t + ' defined');
});

test('r14-premium.css: nothing animates (reduced-motion safe)', () => {
  assert.ok(!/@keyframes|animation\s*:\s*(?!none)/.test(css), 'no new animation');
  assert.ok(!/transition\s*:/.test(css), 'no new transition');
});

test('r14-premium.css is the LAST part of bundle-theme.css (loaded last on every page)', () => {
  const b = rd('tools/build.py');
  const m = b.match(/bundle\('bundle-theme\.css', \[([^\]]*)\]\)/); assert.ok(m);
  const parts = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  assert.equal(parts.at(-1), 'r14-premium.css');
  assert.ok(rd('css/bundle-theme.css').trimEnd().endsWith(rd('css/r14-premium.css').trimEnd()), 'bundle rebuilt');
});

test('quiet background: no glyph canvas, no ticker strip, no code horizon (live)', () => {
  assert.match(rd('js/bg.js'), /var GLYPHS = false;/);
  assert.match(css, /#ccbg\{display:none!important\}/);
  assert.match(css, /--r13t-tick:0px/);
  assert.match(css, /\.ftx\{display:none!important\}/);
});

test('mascot and LCP image untouched by the r14 layer', () => {
  assert.ok(!/ai-mascot|mascot/.test(css));
  assert.ok(!/fetchpriority|\.lcp/.test(css));
});

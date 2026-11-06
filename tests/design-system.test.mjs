// r13 design-system: DESIGN.md, tokens.json and css/ds.css stay in sync; the hex / off-grid ratchet holds;
// the r13 layer is live-only (?static=1 untouched). node --test tests/design-system.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lint, scan } from '../tools/ds/lint.mjs';
const rd = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const tokens = JSON.parse(rd('tokens/tokens.json'));
const design = rd('DESIGN.md');
const front = design.split(/^---$/m)[1];
const fm = (path) => {   // tiny YAML reader for "  key: value" lines under a top-level section
  const [sec, key] = path.split('.'); const block = front.split(new RegExp('^' + sec + ':\\s*$', 'm'))[1].split(/^\S/m)[0];
  const m = block.match(new RegExp('^\\s+"?' + key.replace(/[-]/g, '\\-') + '"?:[ \\t]*(?:"([^"]*)"|([^\\s#]+))', 'm')); return m && (m[1] ?? m[2]).trim();
};

test('DESIGN.md has the spec sections in canonical order', () => {
  const order = ['Overview', 'Colors', 'Typography', 'Layout', 'Elevation & Depth', 'Shapes', 'Components', "Do's and Don'ts"];
  const idx = order.map((h) => design.indexOf('\n## ' + h + '\n'));
  assert.ok(idx.every((i) => i > 0), 'missing section: ' + order.filter((h, i) => idx[i] < 0));
  assert.deepEqual([...idx].sort((a, b) => a - b), idx);
});

test('DESIGN.md colour roles = tokens.json $roles.light', () => {
  for (const [k, v] of Object.entries(tokens.$roles.light)) {
    const d = fm('colors.' + k); assert.ok(d, 'DESIGN.md lacks colors.' + k);
    assert.equal(d.toLowerCase(), v.toLowerCase(), 'colors.' + k);
  }
});

test('DESIGN.md grid + spacing = tokens.json', () => {
  for (const bp of ['compact', 'medium', 'expanded']) {
    assert.equal(fm('spacing.margin-' + bp), tokens.grid['margin-' + bp]);
    assert.equal(fm('spacing.gutter-' + bp), tokens.grid['gutter-' + bp]);
    assert.equal(fm('spacing.columns-' + bp), tokens.grid['cols-' + bp]);
  }
  for (const [k, v] of Object.entries(tokens.space)) assert.equal(fm('spacing.' + k), v, 'spacing.' + k);
  for (const v of Object.values(tokens.space)) assert.equal(parseInt(v) % 4, 0, 'space on the 4-pt grid: ' + v);
});

test('css/ds.css is live-only, colour-free and on the 4-pt grid', () => {
  const css = rd('css/ds.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.deepEqual(scan(css), { hex: 0, off4: 0 });
  const sels = [...css.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).filter(Boolean);
  assert.ok(sels.length > 20);
  for (const s of sels) for (const part of s.split(/,(?![^()]*\))/)) assert.match(part.trim(), /^html(:root)?:not\(\.static\)/, 'unscoped: ' + part);
});

test('ds.css is the last part of every app bundle', () => {
  const b = rd('tools/build.py');
  for (const n of ['bundle-app.css', 'bundle-dashboard.css', 'bundle-landing.css']) assert.match(b, new RegExp("bundle\\('" + n.replace('.', '\\.') + "', \\[[^\\]]*'ds\\.css'\\]\\)"));
});

test('hex / off-grid ratchet holds', () => {
  const { bad } = lint(); assert.deepEqual(bad, []);
});

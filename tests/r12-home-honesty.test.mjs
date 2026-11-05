// r12 QA fix 2: the live home page shows no placeholder stats, testimonials or empty announcement tile; the Today-in-Tech
// loop copy is hidden from assistive tech. Static checks on the BUILT pages + js/site-stats.js in a sandbox.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const rd = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const index = rd('index.html'), about = rd('about.html'), era = rd('css/era.css');

// element-level parse: for each opening tag carrying attr, is it (or an ancestor within the page) gated?
function gatedEverywhere(html, attr) {
  const re = /<(\/?)([a-z0-9]+)([^>]*)>/gi; const stack = []; const bad = []; let m;
  const VOID = new Set(['img', 'br', 'input', 'meta', 'link', 'source', 'hr', 'use', 'path', 'wbr']);
  while ((m = re.exec(html))) {
    const [, close, tag, attrs] = m; const t = tag.toLowerCase();
    if (close) { const i = stack.map((s) => s.t).lastIndexOf(t); if (i >= 0) stack.length = i; continue; }
    const gate = /\sdata-stat-gate="/.test(attrs);
    if (new RegExp(`\\s${attr}="`).test(attrs) && !gate && !stack.some((s) => s.gate)) bad.push(attrs.trim().slice(0, 80));
    if (!VOID.has(t) && !attrs.trim().endsWith('/')) stack.push({ t, gate });
  }
  return bad;
}
test('every placeholder stat on index/about sits inside a data-stat-gate, and the CSS hides ungated-real ones live', () => {
  assert.deepEqual(gatedEverywhere(index, 'data-site-stat'), []);
  assert.deepEqual(gatedEverywhere(index, 'data-stat'), []);
  assert.deepEqual(gatedEverywhere(about, 'data-site-stat'), []);
  assert.ok(era.includes('html:not(.static) [data-stat-gate]:not(.stat-real){display:none!important}'));
  assert.ok(!/content="Join 10,000\+/.test(index), 'meta description still claims 10,000+');
});
test('site-stats: every value is marked real:false today, isReal() false, short() empty; apply() writes nothing for them', () => {
  const src = rd('js/site-stats.js');
  const els = []; const mk = (ds) => ({ dataset: ds, textContent: 'orig', classList: { on: null, toggle(c, v) { this.on = v; } } });
  const gateEl = mk({ statGate: 'members resources' }), statEl = mk({ siteStat: 'members' });
  const document = { readyState: 'complete', documentElement: { classList: { contains: () => false } }, addEventListener() {},
    querySelectorAll: (s) => (s === '[data-stat-gate]' ? [gateEl] : s === '[data-site-stat]' ? [statEl] : els) };
  const window = {}; vm.runInNewContext(src, { window, document, location: { search: '' } });
  const S = window.CC_SITE_STATS;
  for (const [k, v] of Object.entries(S.items)) { assert.equal(v.real, false, k); assert.equal(S.isReal(k), false, k); assert.equal(S.short(k), '', k); }
  assert.equal(gateEl.classList.on, false); assert.equal(statEl.textContent, 'orig');
  // once the founder marks one real, its gate opens and the value is written
  S.items.members.real = true; assert.equal(S.short('members'), '10K+');
});
test('testimonials are mockup-only (data-legacy) and the empty Latest-updates band is hidden until real announcements render', () => {
  const tcards = index.match(/<article[^>]*class="tcard[^"]*"[^>]*>/g) || [];
  assert.ok(tcards.length >= 1); for (const t of tcards) assert.match(t, /data-legacy="testimonials"/);
  assert.match(index, /<section class="band" data-legacy="testimonials">/);
  assert.match(index, /WHAT OUR MEMBERS SAY/); assert.match(index, /<h2 data-legacy="testimonials"[^>]*>WHAT OUR MEMBERS SAY/);
  assert.match(index, /<section class="e92 e-news" data-latest-section/);
  assert.ok(era.includes('html:not(.static) [data-latest-section]:not(.has-items){display:none!important}'));
  assert.ok(rd('js/era.js').includes('sec.classList.add("has-items")'));
});
test('marquees: loop copies are aria-hidden and untabbable (partner strip + Today in Tech), so headlines are read once', () => {
  const sets = index.match(/<ul class="e-set"[^>]*>/g); assert.equal(sets.length, 2); assert.match(sets[1], /aria-hidden="true"/);
  const ui = rd('js/ui.js'); assert.ok(ui.includes(`' aria-hidden="true" tabindex="-1" data-mq-copy'`)); assert.ok(!ui.includes('items + "<i>■</i>" + items'));
});

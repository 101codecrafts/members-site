// r12 QA fix 4: decoded page titles, auth field helper outside the <label>, theme toggle width, organiser button hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const rd = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('no built page has a double-escaped entity in <title>/<meta>; events title decodes to "Events & Meetups"', () => {
  for (const f of readdirSync(new URL('..', import.meta.url)).filter((f) => f.endsWith('.html'))) {
    const h = rd(f); const head = h.slice(0, h.indexOf('</head>'));
    assert.ok(!/&amp;(amp|lt|gt|quot|#\d+);/.test(head), f);
  }
  assert.match(rd('events.html'), /<title>Events &amp; Meetups · 101 Codecrafts<\/title>/);
});
test('auth-flow field(): label holds only the name; hint + error outside it, linked by aria-describedby (hint first)', () => {
  const src = rd('js/auth-flow.js');
  const a = src.indexOf('  var field = function'), b = src.indexOf('  var select = function');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const S = { data: {} };
  const { field, input } = new Function('esc', 'S', src.slice(a, b) + '; return { field, input };')(esc, S);
  const h = field('email', 'Email', input('email', 'email', 'required'), { hint: 'No temporary or disposable addresses.' });
  assert.match(h, /^<div class="af-field"><label for="f-email">Email<\/label><input [^>]*aria-describedby="h-email m-email"/);
  assert.match(h, /<small id="h-email">No temporary or disposable addresses\.<\/small><p class="af-msg" id="m-email" role="alert"><\/p><\/div>$/);
  assert.ok(!/<label[^>]*>[^]*<small/.test(h.slice(0, h.indexOf('</label>') + 8)), 'hint must not sit inside the label');
  const n = field('name', 'Full name', input('name', 'text', ''), {}); assert.match(n, /aria-describedby="m-name"/); assert.ok(!n.includes('<small'));
});
test('theme toggle keeps a 44 px touch target; organiser button respects [hidden]', () => {
  assert.ok(rd('css/app.css').includes('html:not(.static) .cc-toolbar #cc-theme{flex:none;min-width:var(--touch-min-target,44px)'));
  assert.ok(rd('css/feed.css').includes('#org-btn[hidden]{display:none!important}'));
});
test('events.html carries the standard app footer like the other feed pages', () => {
  for (const f of ['events.html', 'news.html', 'opportunities.html']) assert.match(rd(f), /<footer class="flow-foot">/, f);
});

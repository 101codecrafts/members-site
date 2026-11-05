// r12 ai: the 101 AI markdown renderer (js/ai-float.js md()) is safe and handles code, tables, maths. Mini DOM, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../js/ai-float.js', import.meta.url), 'utf8');
const a = src.indexOf('  /* maths:'), b = src.indexOf('  var busy = false, ctl = null;');
class N { constructor(t) { this.tagName = t; this.childNodes = []; this.className = ''; this._t = ''; } appendChild(c) { this.childNodes.push(c); return c; } get lastChild() { return this.childNodes[this.childNodes.length - 1]; } set textContent(v) { this.childNodes = []; this._t = v; } get textContent() { return this._t + this.childNodes.map((c) => c.textContent).join(''); } addEventListener() {} setAttribute() {} }
class T { constructor(t) { this.t = t; } get textContent() { return this.t; } }
const d = { createElement: (t) => new N(t.toUpperCase()), createTextNode: (t) => new T(t) };
function el(t, c, txt) { const e = d.createElement(t); if (c) e.className = c; if (txt != null) e.textContent = txt; return e; }
const md = new Function('d', 'el', 'navigator', src.slice(a, b) + '; return md;')(d, el, {});
const all = (n, out = []) => { if (n instanceof N) { out.push(n); n.childNodes.forEach((c) => all(c, out)); } return out; };
const render = (s) => { const box = new N('DIV'); md(s, box); return box; };

test('fenced code block keeps code verbatim with language + copy button', () => {
  const box = render('Here:\n```python\ndef f(n):\n    return n*2\n```');
  const pre = all(box).find((n) => n.tagName === 'PRE'); assert.ok(pre);
  assert.equal(pre.childNodes.find((n) => n.tagName === 'CODE').textContent, 'def f(n):\n    return n*2');
  assert.ok(pre.childNodes.some((n) => n.className === 'ai-lang' && n.textContent === 'python'));
  assert.ok(pre.childNodes.some((n) => n.tagName === 'BUTTON'));
});
test('HTML and javascript: links never become elements', () => {
  const box = render('<img src=x onerror=alert(1)> [x](javascript:alert(1)) <script>alert(1)</script> | <b>t</b> |');
  const tags = all(box).map((n) => n.tagName);
  assert.ok(!tags.includes('IMG') && !tags.includes('SCRIPT') && !tags.includes('B'));
  assert.ok(!all(box).some((n) => n.tagName === 'A'));
});
test('https links get noopener; tables, headings, lists, quotes', () => {
  const box = render('### Title\n- a\n- b\n\n| h1 | h2 |\n|---|---|\n| 1 | 2 |\n> q\n[ok](https://example.org)');
  const tags = all(box).map((n) => n.tagName);
  for (const t of ['H4', 'UL', 'TABLE', 'TH', 'TD', 'BLOCKQUOTE', 'A']) assert.ok(tags.includes(t), t);
  const a = all(box).find((n) => n.tagName === 'A'); assert.equal(a.href, 'https://example.org'); assert.equal(a.rel, 'noopener noreferrer');
});
test('maths: LaTeX shown as readable unicode; money amounts are not maths', () => {
  const box = render('Solve $x^2 + 3x = \\frac{1}{2}$ and \\(\\sqrt{16} \\times 2\\). It costs $5 and $10.');
  const m = all(box).filter((n) => n.className === 'ai-math').map((n) => n.textContent);
  assert.deepEqual(m, ['x² + 3x = 1/2', '√(16) × 2']);
  assert.ok(box.textContent.includes('costs $5 and $10'));
});
test('an unfinished code block while streaming still renders', () => {
  const box = render('```js\nconst a = 1;');
  assert.equal(all(box).find((n) => n.tagName === 'CODE').textContent, 'const a = 1;');
});

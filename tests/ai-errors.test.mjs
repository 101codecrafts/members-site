// r12 QA fix 1: the "used today's free AI allowance" copy shows ONLY for the server's machine code ai_quota.
// Any other 5xx (ai_unavailable, a proxy 503 with no body, …) shows "101 AI can't answer right now. Try again in a minute."
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const fl = readFileSync(new URL('../js/ai-float.js', import.meta.url), 'utf8');
const a = fl.indexOf('  var NOAPI ='), b = fl.indexOf('  /* end ai error text */');
const errInfo = new Function('WA', fl.slice(a, b) + '; return errInfo;')('https://chat.whatsapp.com/x');
const QUOTA = /free AI allowance/, UNAV = "101 AI can't answer right now. Try again in a minute.";

test('assistant: ai_quota → quota copy, no Try again', () => {
  const r = errInfo(503, { error: { code: 'ai_quota', resets_at: '2026-11-07T00:00:00.000Z', message: "101 AI has used today's free AI allowance. It resets at 03:00 Kampala time." } });
  assert.match(r.text, QUOTA); assert.equal(r.retry, false);
  assert.match(errInfo(503, { error: 'ai_quota', resets_at: 'x' }).text, QUOTA);   // flat shape too
});
test('assistant: any other 503 / 5xx → "can\'t answer right now" with Try again, never the quota copy', () => {
  for (const [st, j] of [[503, { error: { code: 'ai_unavailable', message: UNAV } }], [503, null], [503, { error: { code: 'busy', message: "101 AI has used today's free AI allowance" } }], [500, { error: { code: 'internal' } }], [502, null], [504, {}]]) {
    const r = errInfo(st, j); assert.equal(r.text, UNAV, `${st} ${JSON.stringify(j)}`); assert.equal(r.retry, true); assert.doesNotMatch(r.text, QUOTA);
  }
});
test('assistant: 429 / 400 keep the server message; 404 = not switched on', () => {
  assert.equal(errInfo(429, { error: { code: 'rate_limited', message: 'slow down' } }).text, 'slow down');
  assert.equal(errInfo(400, { error: { code: 'bad_request', message: 'too long' } }).text, 'too long');
  assert.match(errInfo(404, null).text, /isn't switched on/);
});
test('assistant client wires errInfo into ask() and hides Try again only when noRetry', () => {
  assert.ok(fl.includes('errInfo(r.status, ej)')); assert.ok(fl.includes('if (!(e && e.noRetry))')); assert.ok(!fl.includes('BUSY'));
});

const fs = readFileSync(new URL('../js/feed-api.js', import.meta.url), 'utf8');
function explainWith(status, body) {
  const window = { CC_CONFIG: { apiBase: '/api' } };
  const ctx = vm.createContext({ window, console, URLSearchParams, AbortController, setTimeout, clearTimeout, Date, JSON, navigator: { onLine: true },
    location: new URL('https://x.test/news.html'), localStorage: { getItem: () => null, setItem() {} },
    fetch: async () => ({ ok: status < 400, status, json: async () => { if (body === undefined) throw new Error('no json'); return body; } }) });
  vm.runInContext(fs, ctx);
  return window.CC_FEED_API.explainNews({ id: 'hn-1', title: 'T', url: 'https://example.org/a' });
}
test('Explain dialog: ai_quota → quota copy without retry; ai_unavailable / bare 503 → "can\'t answer right now" + retry', async () => {
  const q = await explainWith(503, { error: { code: 'ai_quota', resets_at: '2026-11-07T00:00:00.000Z', message: "101 AI has used today's free AI allowance (it resets at 03:00 Kampala time)." } });
  assert.match(q.explanation, QUOTA); assert.equal(q.retry, false); assert.equal(q.quota, true);
  for (const body of [{ error: { code: 'ai_unavailable', message: UNAV } }, undefined, { error: { code: 'busy', message: "used today's free AI allowance" } }]) {
    const r = await explainWith(503, body); assert.equal(r.explanation, UNAV); assert.equal(r.retry, true);
  }
  const ok = await explainWith(200, { data: { explanation: 'In simple words: x' } }); assert.equal(ok.explanation, 'In simple words: x');
});

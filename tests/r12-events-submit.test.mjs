// r12 QA fix 3: event submissions need sign-in; honeypot; honest refusals; real backend route.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const rd = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('events.html: visitors get "Sign in to submit an event" → /auth.html?next=/events.html; the form starts hidden and carries a honeypot', () => {
  const h = rd('events.html');
  assert.match(h, /<p id="ev-signin"[^>]*><a class="btn or" href="\/auth\.html\?next=\/events\.html">Sign in to submit an event<\/a><\/p>/);
  assert.match(h, /<form class="grid g2 sub-form" id="ev-form"[^>]*\shidden>/);
  assert.match(h, /<div class="ev-hp" aria-hidden="true"><label>[^<]*<input name="website" type="text" tabindex="-1" autocomplete="off">/);
  const css = rd('css/feed.css'); assert.ok(css.includes('#ev-form[hidden],#ev-signin[hidden]{display:none!important}')); assert.match(css, /\.ev-hp\{position:absolute!important;left:-10000px/);
  const js = rd('js/events.js'); assert.ok(js.includes('CCAccess.onChange(evGate)')); assert.ok(js.includes('CCAccess.role !== "visitor"'));
});

function load(fetchImpl) {
  const window = { CC_CONFIG: { apiBase: '/api' } }; const calls = [];
  const ctx = vm.createContext({ window, console, URLSearchParams, AbortController, setTimeout, clearTimeout, Date, JSON, navigator: { onLine: true },
    location: new URL('https://x.test/events.html'), localStorage: { getItem: () => null, setItem() {} },
    fetch: async (u, init) => { calls.push([u, init && JSON.parse(init.body || 'null')]); return fetchImpl(u, init); } });
  vm.runInContext(rd('js/feed-api.js'), ctx);
  return { F: window.CC_FEED_API, calls };
}
const form = { title: 'Kampala Python meetup', url: 'https://example.org/e', org: 'huggingface', type: 'meetup', start: '2026-12-01T11:00:00.000Z', end: '', region: 'kampala', venue: 'Kampala', price: 0, currency: 'UGX', desc: 'x', contact: '', website: '' };
const res = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('submitEvent posts the backend shape to /v1/events/external (honeypot passed through)', async () => {
  const { F, calls } = load(() => res(200, { data: { id: 'e1', status: 'pending_review' } }));
  const r = await F.submitEvent(form); assert.equal(r.status, 'pending_review'); assert.ok(!r.notSent);
  assert.equal(calls[0][0], '/api/v1/events/external');
  assert.deepEqual(calls[0][1], { title: 'Kampala Python meetup', organiser: 'hugging_face', mode: 'physical', starts_at: '2026-12-01T11:00:00.000Z', source_url: 'https://example.org/e', website: '', venue: 'Kampala', city: 'Kampala', event_type: 'meetup', price: 0, currency: 'UGX', description: 'x' });
  assert.equal(F._eventBody({ ...form, region: 'online', org: 'community' }).mode, 'online');
  assert.equal(F._eventBody({ ...form, org: 'community' }).organiser, 'other');
});
test('refusals are honest and nothing is queued: 401 sign in, 429 daily cap, 400 details, network → not sent', async () => {
  assert.match((await load(() => res(401, { error: { code: 'unauthorized' } })).F.submitEvent(form)).message, /sign in to submit an event/);
  const lim = await load(() => res(429, { error: { code: 'rate_limited', message: 'You can submit up to 5 events a day. Please try again tomorrow.' } })).F.submitEvent(form);
  assert.equal(lim.notSent, true); assert.match(lim.message, /5 events a day/);
  assert.match((await load(() => res(400, { error: { code: 'bad_request' } })).F.submitEvent(form)).message, /https:\/\//);
  const net = await load(() => { throw new TypeError('fetch failed'); }).F.submitEvent(form); assert.equal(net.notSent, true);
});

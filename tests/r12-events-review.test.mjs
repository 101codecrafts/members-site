// r12 events review: admin console "Events to review" + the review client in feed-api + the form fields now sent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const rd = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

function console_() {
  const document = { readyState: 'loading', addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], documentElement: { classList: { add() {}, remove() {} } } };
  const window = {};
  const ctx = vm.createContext({ window, document, location: new URL('https://x.test/admin.html'), URLSearchParams, Intl, URL, sessionStorage: { getItem: () => null }, addEventListener() {}, setTimeout, clearTimeout, console });
  vm.runInContext(rd('js/admin-console.js'), ctx);
  return window.CCAdminEvents;
}
const item = { id: '3f1c2a4e-1111-4222-8333-444455556666', title: 'Kampala <AI> meetup', organiser: 'google_gdg', mode: 'physical', venue: 'Makerere', city: 'Kampala',
  starts_at: '2026-12-01T14:00:00Z', ends_at: '2026-12-01T17:00:00Z', link: 'https://gdg.community.dev/e/x', price_text: 'Free', event_type: 'meetup', description: 'Talks',
  contact_email: 'a@example.org', submitted_at: '2026-11-06T03:00:00Z', status: 'pending_review', submitter: { id: 'user_a', display_name: 'Alice N', username: 'alice' } };

test('admin.html: "Events to review" tab (scope approvals) + panel with list, pager and loader', () => {
  const h = rd('admin.html');
  assert.match(h, /<a href="#events" data-tab="events" data-scope="approvals">Events to review <i class="ac-n" id="n-events" hidden><\/i><\/a>/);
  assert.match(h, /<section class="ac-panel" id="events" data-panel="events" aria-labelledby="ev-h" hidden>/);
  assert.match(h, /<div class="ac-list" id="ev-list">/); assert.match(h, /<div class="ac-pager" id="ev-pager"><\/div>/);
  assert.equal((h.match(/id="events"/g) || []).length, 1, 'one #events id');
});

test('card: title, organiser, dates (EAT), link, submitter, submitted time, Approve + Reject with a reason form; all escaped', () => {
  const E = console_();
  const c = E.card(item);
  assert.match(c, /Kampala &lt;AI&gt; meetup/); assert.doesNotMatch(c, /<AI>/);
  assert.match(c, /Google \/ GDG/);
  assert.match(c, /01 Dec 2026, 17:00 → 01 Dec 2026, 20:00 EAT/);
  assert.match(c, /<a href="https:\/\/gdg\.community\.dev\/e\/x" target="_blank" rel="noopener noreferrer nofollow">/);
  assert.match(c, /by <b>Alice N<\/b>/); assert.match(c, /sent 06 Nov 2026, 06:00 EAT/);
  assert.match(c, /data-ev-approve="3f1c2a4e-1111-4222-8333-444455556666"/);
  assert.match(c, /data-ev-reject="3f1c2a4e-[^"]+" aria-expanded="false" aria-controls="evr-3f1c2a4e-/);
  assert.match(c, /<form class="ac-ev-reject" id="evr-[^"]+" data-ev-reject-form="[^"]+" hidden novalidate>/);
  assert.match(c, /<textarea name="reason" rows="2" maxlength="300" required minlength="3"/);
  assert.equal(E.REASON_MAX, 300);
  assert.match(c, /mailto:a@example\.org/); assert.match(c, /Talks/);
});

test('card: a non-https link is never rendered as a link; no submitter = imported feed; missing details are left out', () => {
  const E = console_();
  const c = E.card({ ...item, link: 'javascript:alert(1)', submitter: null, description: null, contact_email: null, event_type: null, price_text: null });
  assert.doesNotMatch(c, /javascript:/); assert.match(c, /link is not https/); assert.match(c, /imported feed/);
  assert.doesNotMatch(c, /mailto:/); assert.doesNotMatch(c, /ac-ev-desc/);
  assert.equal(E.dates({ starts_at: '2026-12-01T14:00:00Z', ends_at: null }), '01 Dec 2026, 17:00 EAT');
});

test('admin-console: calls the real routes, sends the reason only on reject, checks 3..300 before sending, empty + error states, demo writes never sent', () => {
  const js = rd('js/admin-console.js');
  assert.ok(js.includes('api("/admin/events/pending" + qs({ limit: EV.limit, offset: EV.offset }))'));
  assert.ok(js.includes('post(`/admin/events/${encodeURIComponent(id)}/${decision}`, decision === "reject" ? { reason } : {})'));
  assert.ok(js.includes('if (reason.length < 3)')); assert.ok(js.includes('if (reason.length > EV_REASON_MAX)'));
  assert.ok(js.includes('No events waiting for review.'));
  assert.ok(js.includes('failed("Events to review could not load.")'));
  assert.ok(js.includes('if (DEMO) { toast("Demo: nothing was saved"); return; }'));
  assert.match(js, /const PANELS = \{ overview, approvals, events: eventsReview,/);
});

function feed(fetchImpl) {
  const window = { CC_CONFIG: { apiBase: '/api' } }; const calls = []; const store = {};
  const ctx = vm.createContext({ window, console, URLSearchParams, AbortController, setTimeout, clearTimeout, Date, JSON, navigator: { onLine: true },
    location: new URL('https://x.test/admin.html'), localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    fetch: async (u, init) => { calls.push([u, init && init.method, init && JSON.parse(init.body || 'null')]); return fetchImpl(u, init); } });
  vm.runInContext(rd('js/feed-api.js'), ctx);
  return { F: window.CC_FEED_API, calls };
}
const res = (status, body) => ({ ok: status < 400, status, json: async () => body });

test('feed-api reviewEvent: real admin routes; reject needs 3..300 chars; local preview ids never hit the server; failures are honest', async () => {
  const id = item.id;
  let { F, calls } = feed(() => res(200, { data: { id, status: 'published' } }));
  assert.equal((await F.reviewEvent(id, true)).ok, true);
  assert.deepEqual(calls[0], [`/api/v1/admin/events/${id}/approve`, 'POST', {}]);
  ({ F, calls } = feed(() => res(200, { data: { id, status: 'rejected' } })));
  assert.equal((await F.reviewEvent(id, false, '  Not an event page ')).ok, true);
  assert.deepEqual(calls[0], [`/api/v1/admin/events/${id}/reject`, 'POST', { reason: 'Not an event page' }]);
  ({ F, calls } = feed(() => res(200, {})));
  assert.match((await F.reviewEvent(id, false, 'no')).message, /3 to 300/); assert.equal(calls.length, 0);
  assert.match((await F.reviewEvent(id, false, 'x'.repeat(301))).message, /3 to 300/);
  assert.equal((await F.reviewEvent('evs123', true)).local, true); assert.equal(calls.length, 0);
  ({ F } = feed(() => res(409, { error: { code: 'conflict' } })));
  const r = await F.reviewEvent(id, true); assert.equal(r.ok, false); assert.match(r.message, /Not saved/);
  assert.doesNotMatch(rd('js/feed-api.js'), /post\(`\/events\/\$\{encodeURIComponent\(id\)\}\/\$\{approve/, 'old non-existent route is gone');
});

test('submit sends the fields the form asks for: type, price, currency, description, contact email (validated client-side)', () => {
  const { F } = feed(() => res(200, {}));
  const f = { title: 'T', url: 'https://e.org', org: 'mlh', type: 'hackathon', start: '2026-12-01T10:00:00.000Z', end: '', region: 'kampala', venue: 'V', price: 20000, currency: 'USD', desc: '  48h  ', contact: ' me@e.org ', website: '' };
  const b = F._eventBody(f);
  assert.equal(b.event_type, 'hackathon'); assert.equal(b.price, 20000); assert.equal(b.currency, 'USD'); assert.equal(b.description, '48h'); assert.equal(b.contact_email, 'me@e.org');
  const z = F._eventBody({ ...f, type: 'party', price: -5, currency: 'EUR', desc: '', contact: '' });
  for (const k of ['event_type', 'price', 'currency', 'description', 'contact_email']) assert.equal(k in z, false, k);
});

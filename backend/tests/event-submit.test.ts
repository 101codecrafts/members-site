// r12 QA fix 3: member event submissions — sign-in, honeypot, 5 per user per day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eventSubmitSchema, isBot, toInsert, toExtended, contactOf, priceText, EVENT_SUBMIT_LIMIT, HONEYPOT } from '../lib/event-submit.ts';

const ok = { title: 'Kampala Python meetup', organiser: 'other', mode: 'physical', venue: 'Kampala', starts_at: '2026-12-01T14:00:00.000Z', source_url: 'https://example.org/Meetup' };
test('valid submission parses; honeypot empty → not a bot; insert row drops the honeypot and dedupes by URL', () => {
  const b = eventSubmitSchema.parse({ ...ok, [HONEYPOT]: '' });
  assert.equal(isBot(b), false);
  const row = toInsert(b); assert.equal(HONEYPOT in row, false); assert.equal(row.dedupe_key, 'member:https://example.org/meetup');
  assert.equal(isBot(eventSubmitSchema.parse(ok)), false);
});
test('honeypot filled → bot (whitespace-only is not)', () => {
  assert.equal(isBot(eventSubmitSchema.parse({ ...ok, [HONEYPOT]: 'http://spam.example' })), true);
  assert.equal(isBot(eventSubmitSchema.parse({ ...ok, [HONEYPOT]: '   ' })), false);
});
test('schema rejects http links, bad dates, short titles', () => {
  for (const bad of [{ source_url: 'http://example.org' }, { starts_at: 'tomorrow' }, { title: 'x' }]) assert.equal(eventSubmitSchema.safeParse({ ...ok, ...bad }).success, false);
});
test('per-user cap is 5 per day; the route requires a member, checks the honeypot before the cap, keys the cap by user id', () => {
  assert.deepEqual({ ...EVENT_SUBMIT_LIMIT }, { name: 'event_submit', max: 5, windowSeconds: 86400 });
  const src = readFileSync(new URL('../app/api/v1/events/external/route.ts', import.meta.url), 'utf8');
  const post = src.slice(src.indexOf('export const POST'));
  const iMember = post.indexOf('requireMember()'), iBot = post.indexOf('isBot(b)'), iCap = post.indexOf('rateLimit(EVENT_SUBMIT_LIMIT, s.userId)'), iIns = post.indexOf('.insert({ ...base, ...ext })');
  assert.ok(iMember > 0 && iMember < iBot && iBot < iCap && iCap < iIns, 'order: member → honeypot → per-user cap → insert');
  assert.match(post, /status: 202/);
});

// r12 event review: the dropped form fields are now accepted and stored (new columns + a private contact table).
test('form fields: type/price/currency/description go to the extended columns; price also lands in price_text; contact is separate', () => {
  const b = eventSubmitSchema.parse({ ...ok, event_type: 'hackathon', price: 20000, currency: 'UGX', description: '  48 hours of building  ', contact_email: ' Me@Example.org ' });
  const base = toInsert(b);
  assert.equal(base.price_text, 'UGX 20,000');
  for (const k of ['event_type', 'price', 'currency', 'description', 'contact_email']) assert.equal(k in base, false, `${k} is not a round-11 column`);
  assert.deepEqual(toExtended(b), { event_type: 'hackathon', price: 20000, currency: 'UGX', description: '48 hours of building' });
  assert.equal(contactOf(b), 'me@example.org');
  assert.equal(priceText(0, 'USD'), 'Free'); assert.equal(priceText(undefined, 'UGX'), undefined); assert.equal(priceText(15, 'USD'), 'USD 15');
  const bare = eventSubmitSchema.parse({ ...ok, contact_email: '' });
  assert.deepEqual(toExtended(bare), {}); assert.equal(contactOf(bare), null); assert.equal('price_text' in toInsert(bare), false);
});
test('form fields are validated: unknown type/currency, negative price, long description, bad email are refused', () => {
  for (const bad of [{ event_type: 'party' }, { currency: 'EUR' }, { price: -1 }, { description: 'x'.repeat(401) }, { contact_email: 'not-an-email' }])
    assert.equal(eventSubmitSchema.safeParse({ ...ok, ...bad }).success, false, JSON.stringify(bad));
});
test('submit route degrades safely: falls back to the round-11 insert on a schema-outdated error and stores the contact privately', () => {
  const src = readFileSync(new URL('../app/api/v1/events/external/route.ts', import.meta.url), 'utf8');
  assert.match(src, /isSchemaOutdated\(r\.error\)/);
  assert.match(src, /\.insert\(base\)/);
  assert.match(src, /from\('external_event_contacts'\)/);
  assert.match(src, /details_stored/);
  assert.doesNotMatch(src, /\.select\(\)/, 'insert returns only id + status');
});

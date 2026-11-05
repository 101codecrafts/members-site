// r12 QA fix 3: member event submissions — sign-in, honeypot, 5 per user per day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { eventSubmitSchema, isBot, toInsert, EVENT_SUBMIT_LIMIT, HONEYPOT } from '../lib/event-submit.ts';

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
  const iMember = post.indexOf('requireMember()'), iBot = post.indexOf('isBot(b)'), iCap = post.indexOf('rateLimit(EVENT_SUBMIT_LIMIT, s.userId)'), iIns = post.indexOf('.insert(toInsert(b))');
  assert.ok(iMember > 0 && iMember < iBot && iBot < iCap && iCap < iIns, 'order: member → honeypot → per-user cap → insert');
  assert.match(post, /status: 202/);
});

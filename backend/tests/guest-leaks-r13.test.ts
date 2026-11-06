// r13 guest-leaks: guest accounts are `active`, so requireMember() let them into learner features.
// Every route below now gates on the shared access contract (requireMemberCan(action)) on the SERVER.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decide } from '../lib/access.ts';

const src = (p: string) => readFileSync(new URL(`../app/api/v1/${p}/route.ts`, import.meta.url), 'utf8');
const method = (s: string, m: string) => { const i = s.indexOf(`export const ${m}`); assert.ok(i >= 0, `no ${m}`); const j = s.indexOf('export const', i + 10); return s.slice(i, j < 0 ? undefined : j); };

// [route, method, action] — what a guest must NOT reach, and the action that now guards it
export const GATED: Array<[string, string, string]> = [
  ['sessions', 'GET', 'shell.full'], ['sessions/[id]', 'GET', 'shell.full'], ['sessions/[id]/join', 'GET', 'shell.full'], ['sessions/[id]/join', 'POST', 'shell.full'],
  ['leaderboard', 'GET', 'shell.full'], ['meetings', 'GET', 'shell.full'], ['meetings', 'POST', 'shell.full'],
  ['activities/[id]/comments', 'GET', 'shell.full'], ['activities/[id]/comments', 'POST', 'community.post'],
  ['activities/[id]/like', 'POST', 'community.post'], ['activities/[id]/like', 'DELETE', 'community.post'],
  ['conversations', 'GET', 'message.send'], ['conversations', 'POST', 'message.send'],
  ['conversations/[id]/messages', 'GET', 'message.send'], ['conversations/[id]/messages', 'POST', 'message.send'],
  ['groups/[id]/join', 'POST', 'community.post'],
  ['submissions', 'GET', 'review.submit'], ['submissions', 'POST', 'review.submit'], ['submissions/[id]', 'DELETE', 'review.submit'],
  ['articles', 'POST', 'review.submit'], ['articles/[slug]', 'PATCH', 'review.submit'],
  ['ratings', 'POST', 'rating.create'], ['marketplace/reviews', 'POST', 'rating.create'], ['marketplace/rfqs/[id]/quotes', 'POST', 'market.sell'],
  ['opportunities', 'POST', 'community.post'], ['events/external', 'POST', 'community.post'], ['ai-tools', 'POST', 'community.post'],
  ['events/[id]/register', 'POST', 'event.register'], ['events/[id]/rsvp', 'POST', 'event.register'],
];

test('every gated route method calls requireMemberCan(<action>) and no longer a bare requireMember()/requireUser()', () => {
  for (const [r, m, action] of GATED) {
    const body = method(src(r), m);
    assert.ok(body.includes(`requireMemberCan('${action}')`), `${m} /v1/${r} must call requireMemberCan('${action}')`);
    assert.doesNotMatch(body, /requireMember\(\)|requireUser\(\)/, `${m} /v1/${r} still has a bare member/user check`);
  }
});

test('the contract denies a guest every gated action and allows a learner (or tutor for selling)', () => {
  for (const [r, m, action] of GATED) {
    assert.equal(decide({ role: 'guest' }, action), 'role', `guest must be refused ${action} (${m} /v1/${r})`);
    assert.equal(decide({ role: 'visitor' }, action), 'signin');
    assert.equal(decide({ role: 'learner', plan: 'free', minor: false, consent: true }, action), null, `learner keeps ${action}`);
  }
});

test('guests keep what the product allows them: browse, free courses, AI chat, buy', () => {
  for (const a of ['course.browse', 'course.take_external', 'course.take_free', 'ai.chat', 'market.browse', 'market.buy', 'practice.use', 'news.read', 'event.browse'])
    assert.equal(decide({ role: 'guest', plan: 'free', minor: false, consent: true }, a), null, a);
});

test('requireMemberCan = requireMember (active account) + the contract decision', () => {
  const auth = readFileSync(new URL('../lib/auth.ts', import.meta.url), 'utf8');
  const fn = auth.slice(auth.indexOf('export async function requireMemberCan'));
  assert.match(fn, /await requireMember\(\)/);
  assert.match(fn, /decide\(accessCtx\(s, plan\), action\)/);
  assert.match(fn, /throw new AppError\('forbidden'/);
});

test('public course and article reads never select(*) (no review notes / requested prices to visitors or guests)', () => {
  const cat = readFileSync(new URL('../repositories/catalog.ts', import.meta.url), 'utf8');
  const course = cat.slice(cat.indexOf('course: async'), cat.indexOf('tools: async'));
  assert.doesNotMatch(course, /from\('courses'\)\.select\('\*'\)/);
  const sel = course.match(/from\('courses'\)\.select\('([^']*)'\)/);
  assert.ok(sel, 'course detail selects an explicit column list');
  assert.doesNotMatch(sel![1], /review_note|reviewed_by|requested_price_ugx|price_reviewed_at/);
  const art = method(src('articles/[slug]'), 'GET');
  assert.doesNotMatch(art, /select\('\*/);
  assert.match(src('articles/[slug]'), /const ARTICLE_PUBLIC = '[^']*'/);
  assert.doesNotMatch(src('articles/[slug]').match(/const ARTICLE_PUBLIC = '([^']*)'/)![1], /review|reviewer/);
});

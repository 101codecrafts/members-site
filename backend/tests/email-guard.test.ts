import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, domainOf, inList, normaliseEmail, parseBlocklist } from '../lib/email-normalise.ts';
import { readFileSync } from 'node:fs';

test('gmail dots and +tags collapse to one mailbox', () => {
  assert.equal(normaliseEmail('A.Li.Ce+promo@GMail.com'), 'alice@gmail.com');
  assert.equal(normaliseEmail('alice@googlemail.com'), 'alice@gmail.com');
  assert.equal(normaliseEmail('a.b+x@outlook.com'), 'a.b@outlook.com', 'outlook keeps dots');
  assert.equal(normaliseEmail('a.b+x@students.cavendish.ac.ug'), 'a.b+x@students.cavendish.ac.ug', 'unknown providers untouched');
});
test('vendored disposable list blocks temp-mail domains incl. subdomains', () => {
  const list = parseBlocklist(readFileSync(new URL('../data/disposable_email_blocklist.conf', import.meta.url), 'utf8'));
  assert.ok(list.size > 1000);
  assert.ok(inList('mailinator.com', list));
  assert.ok(inList('x.mailinator.com', list));
  assert.ok(!inList('gmail.com', list));
  assert.equal(domainOf('x@Sub.Example.COM'), 'sub.example.com');
});
test('decision order: allow-list > deny > disposable > subaddress > MX', () => {
  assert.deepEqual(decide({ email: 'a@students.cavendish.ac.ug', rule: 'allow', disposable: true, hasMx: false }), { ok: true });
  assert.deepEqual(decide({ email: 'a@bad.com', rule: 'deny', disposable: false, hasMx: true }), { ok: false, reason: 'denied_domain' });
  assert.deepEqual(decide({ email: 'a@mailinator.com', rule: null, disposable: true, hasMx: true }), { ok: false, reason: 'disposable' });
  assert.deepEqual(decide({ email: 'a+x@gmail.com', rule: null, disposable: false, hasMx: true, blockSubaddress: true }), { ok: false, reason: 'subaddress' });
  assert.deepEqual(decide({ email: 'a@nomx.example', rule: null, disposable: false, hasMx: false }), { ok: false, reason: 'no_mx' });
  assert.deepEqual(decide({ email: 'a@gmail.com', rule: null, disposable: false, hasMx: null }), { ok: true }, 'DNS hiccup never blocks');
  assert.deepEqual(decide({ email: 'not-an-email', rule: null, disposable: false, hasMx: true }), { ok: false, reason: 'invalid' });
});

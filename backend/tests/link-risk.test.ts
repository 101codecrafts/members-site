// Round 11: static link checks used by the admin approval queue.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staticUrlRisk, youTubeId, combine } from '../lib/link-risk.ts';

test('YouTube ids from every common URL form; junk rejected', () => {
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=3', 'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'https://www.youtube.com/live/dQw4w9WgXcQ']) {
    assert.equal(youTubeId(u), 'dQw4w9WgXcQ', u);
  }
  for (const u of ['https://www.youtube.com/watch?v=short', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/', 'not a url']) assert.equal(youTubeId(u), null, u);
});

test('allowlisted https education links are low risk', () => {
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://github.com/101codecrafts/members-site', 'https://www.coursera.org/learn/python', 'https://developer.mozilla.org/en-US/docs/Web']) {
    const r = staticUrlRisk(u);
    assert.equal(r.level, 'low', `${u} ${JSON.stringify(r.flags)}`);
  }
});

test('blocked: bad schemes, private hosts, invalid URLs, denylist', () => {
  assert.equal(staticUrlRisk('javascript:alert(1)').level, 'blocked');
  assert.equal(staticUrlRisk('file:///etc/passwd').level, 'blocked');
  assert.equal(staticUrlRisk('http://localhost:3000/x').level, 'blocked');
  assert.equal(staticUrlRisk('::nope::').level, 'blocked');
  assert.equal(staticUrlRisk('https://sub.bad.example/x', { deny: ['bad.example'] }).level, 'blocked');
});

test('high: shorteners, IP hosts, credentials, punycode, executables', () => {
  for (const [u, code] of [['https://bit.ly/abc', 'shortener'], ['http://192.168.1.10/x', 'ip_host'], ['https://user:pw@github.com/', 'credentials_in_url'],
    ['https://xn--pple-43d.com/', 'punycode'], ['https://example.org/setup.exe', 'executable_download']] as const) {
    const r = staticUrlRisk(u);
    assert.equal(r.level, 'high', `${u} -> ${r.level}`);
    assert.ok(r.flags.some((f) => f.code === code), `${u} missing ${code}`);
  }
});

test('medium: plain http, unknown domain, risky TLD, odd port, lure words', () => {
  assert.equal(staticUrlRisk('http://github.com/x').level, 'medium');
  assert.equal(staticUrlRisk('https://some-blog.example.com/post').level, 'medium');
  assert.ok(staticUrlRisk('https://free-course.xyz/').flags.some((f) => f.code === 'risky_tld'));
  assert.ok(staticUrlRisk('https://example.org:8443/').flags.some((f) => f.code === 'odd_port'));
  assert.ok(staticUrlRisk('https://secure-login.example.net/').flags.some((f) => f.code === 'lure_words'));
});

test('admin allowlist lowers unknown domains; combine takes the worst', () => {
  assert.equal(staticUrlRisk('https://makerere.ac.ug/cs', { allow: ['ac.ug'] }).level, 'low');
  const c = combine([staticUrlRisk('https://github.com/a'), staticUrlRisk('https://bit.ly/x')]);
  assert.equal(c.level, 'high');
  assert.ok(c.flags.every((f) => typeof f.url === 'string'));
  assert.equal(combine([]).level, 'low');
});

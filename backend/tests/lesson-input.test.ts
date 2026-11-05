import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LessonInput, youtubeId, normaliseIsbn, linkVerdict, BuilderCourseInput, courseColumns, SubmissionDecision, ReorderInput } from '../lib/lesson-input.ts';

test('youtubeId: watch, youtu.be, shorts, embed, nocookie, bare id; rejects others', () => {
  for (const u of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtu.be/dQw4w9WgXcQ?t=3', 'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=x']) assert.equal(youtubeId(u), 'dQw4w9WgXcQ', u);
  for (const u of ['https://vimeo.com/123', 'https://evil.com/watch?v=dQw4w9WgXcQ', 'nope', 'https://youtube.com/watch?v=short']) assert.equal(youtubeId(u), null, u);
});

test('normaliseIsbn: check digits for ISBN-10 and ISBN-13', () => {
  assert.equal(normaliseIsbn('978-1-59327-950-9'), '9781593279509');
  assert.equal(normaliseIsbn('0-306-40615-2'), '0306406152');
  assert.equal(normaliseIsbn('9781593279508'), null);
  assert.equal(normaliseIsbn('12345'), null);
});

test('linkVerdict: https only, no credentials, IPs, private hosts or shorteners', () => {
  assert.equal(linkVerdict('https://openstax.org/books/x'), 'ok');
  assert.equal(linkVerdict('http://openstax.org'), 'not_https');
  assert.equal(linkVerdict('javascript:alert(1)'), 'not_https');
  assert.equal(linkVerdict('https://a:b@x.com'), 'has_credentials');
  assert.equal(linkVerdict('https://10.0.0.1/x'), 'ip_address');
  assert.equal(linkVerdict('https://printer.local/'), 'private_host');
  assert.equal(linkVerdict('https://bit.ly/x'), 'shortener');
});

test('LessonInput: each kind maps to the DB payload; quiz answers split out', () => {
  const v = LessonInput.parse({ kind: 'video', title: 'Intro', youtube: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.deepEqual(v.payload, { youtube_id: 'dQw4w9WgXcQ' });
  const b = LessonInput.parse({ kind: 'book', title: 'Read', isbn: '978-1-59327-950-9' });
  assert.deepEqual(b.payload, { isbn: '9781593279509' });
  assert.throws(() => LessonInput.parse({ kind: 'book', title: 'Read' }));
  assert.throws(() => LessonInput.parse({ kind: 'file', title: 'File', url: 'http://x.com/a.pdf' }));
  const t = LessonInput.parse({ kind: 'text', title: 'Notes', content_md: '# Hi' });
  assert.equal(t.content_md, '# Hi');
  const q = LessonInput.parse({ kind: 'quiz', title: 'Check', questions: [{ q: '2+2?', options: ['3', '4'], answer: 1 }] }) as { payload: { questions: object[] }; answers: number[] };
  assert.deepEqual(q.payload.questions, [{ q: '2+2?', options: ['3', '4'] }]);
  assert.deepEqual(q.answers, [1]);
  assert.throws(() => LessonInput.parse({ kind: 'quiz', title: 'Bad', questions: [{ q: 'x', options: ['a', 'b'], answer: 5 }] }));
  assert.throws(() => LessonInput.parse({ kind: 'video', title: 'X', youtube: 'https://vimeo.com/1' }));
});

test('course input: price is a request; reject needs a reason; reorder ids are uuids', () => {
  const c = BuilderCourseInput.parse({ title: 'My course', pricing: { mode: 'paid', price_ugx: 15000 } });
  const cols = courseColumns(c);
  assert.equal(cols.requested_price_ugx, 15000);
  assert.ok(!('price_ugx' in cols) && !('is_free' in cols));
  assert.equal(courseColumns(BuilderCourseInput.parse({ title: 'Free one', pricing: { mode: 'free' } })).requested_price_ugx, 0);
  assert.throws(() => BuilderCourseInput.parse({ title: 'Cheap', pricing: { mode: 'paid', price_ugx: 500 } }));
  assert.throws(() => SubmissionDecision.parse({ decision: 'rejected', reason: 'no' }));
  assert.ok(SubmissionDecision.parse({ decision: 'approved' }));
  assert.throws(() => ReorderInput.parse({ modules: ['x'] }));
});

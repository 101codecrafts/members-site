// r13 architecture (front end, release cut): CDN viewer header only (agent-team setup not in this release).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url).pathname;
const read = (p) => readFileSync(ROOT + p, 'utf8');

function loadApi(cookie, href = 'https://members.test/courses.html') {
  const window = { CC_CONFIG: { apiBase: '/api' }, addEventListener() {}, dispatchEvent() {} };
  const ctx = vm.createContext({ window, console, URL, URLSearchParams, AbortController, setTimeout, clearTimeout, Promise, JSON, Date,
    location: new URL(href), document: { cookie }, sessionStorage: { getItem: () => null, setItem() {} }, localStorage: { getItem: () => null, setItem() {} },
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) }), CustomEvent: class {} });
  vm.runInContext(read('js/api.js'), ctx);
  return (url) => JSON.parse(JSON.stringify(window.CC_V1.viewerHeader(url)));   // vm realm -> plain object
}

test('viewer header: sent same-origin only, and only with a Clerk session cookie', () => {
  assert.deepEqual(loadApi('theme=dark; __session=eyJabc')('/api/v1/articles'), { 'X-CC-Viewer': 'member' });
  assert.deepEqual(loadApi('__session_Xy1=eyJabc')('https://members.test/api/v1/news'), { 'X-CC-Viewer': 'member' });
  assert.deepEqual(loadApi('theme=dark; __client_uat=0')('/api/v1/articles'), {});
  assert.deepEqual(loadApi('__session=')('/api/v1/articles'), {}, 'empty cookie = signed out');
  assert.deepEqual(loadApi('__session=eyJabc')('https://api.other.test/api/v1/articles'), {}, 'cross-origin: never (no preflight surprise)');
});


// r13 seo: search metadata contract for the built pages (run tools/build.py first): node --test tests/seo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const R = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, R), 'utf8');
const site = JSON.parse(read('src/data/site.json'));
const policy = JSON.parse(read('src/data/access-policy.json'));
const SITE = (process.env.SITE_URL || site.site_url).replace(/\/$/, '');
const pages = readdirSync(new URL('src/', R)).filter((f) => f.endsWith('.html'));
const built = Object.fromEntries(pages.map((f) => [f, read(f)]));
const one = (s, re) => { const m = [...s.matchAll(re)]; return m.length === 1 ? m[0][1] : m.length; };
const meta = (s, name) => one(s, new RegExp(`<meta name="${name}" content="([^"]*)"`, 'g'));
const unesc = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const visible = (s) => unesc(s.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
const gated = (f) => { const a = policy.pages[f.replace(/\.html$/, '')]; return !!a && !(policy.actions[a]?.roles || []).includes('visitor'); };
const indexable = pages.filter((f) => meta(built[f], 'robots') !== 'noindex');
const ld = (s) => JSON.parse(one(s, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g));

test('every page has exactly one title, description, robots meta and canonical on SITE', () => {
  for (const f of pages) {
    const s = built[f];
    assert.equal(typeof one(s, /<title>([^<]*)<\/title>/g), 'string', `${f}: one <title>`);
    assert.equal(typeof meta(s, 'description'), 'string', `${f}: one description`);
    assert.equal(typeof meta(s, 'robots'), 'string', `${f}: one robots meta`);
    const c = one(s, /<link rel="canonical" href="([^"]*)"/g);
    assert.ok(typeof c === 'string' && c.startsWith(SITE + '/'), `${f}: canonical on ${SITE} (${c})`);
    assert.ok(!s.includes('github.io/members-site'), `${f}: no stale github.io origin`);
  }
});

test('sign-in-gated, app and draft pages are noindex; the indexable set is small and public', () => {
  for (const f of pages) {
    const r = meta(built[f], 'robots');
    if (gated(f)) assert.equal(r, 'noindex', `${f} is gated for visitors -> noindex`);
    if (site.noindex_pages.includes(f)) assert.equal(r, 'noindex', `${f} is in site.json noindex_pages`);
    if (built[f].includes(site.draft_marker)) assert.equal(r, 'noindex', `${f} carries the legal DRAFT banner`);
  }
  for (const f of ['index.html', 'about.html', 'news.html', 'events.html', 'opportunities.html', 'pricing.html', 'community.html'])
    assert.ok(indexable.includes(f), `${f} should be indexable`);
  for (const f of ['admin.html', 'dashboard.html', 'tutor.html', 'settings.html', 'checkout.html', 'cart.html', 'courses.html', 'auth.html'])
    assert.ok(!indexable.includes(f), `${f} must not be indexable`);
});

test('indexable pages have unique, well-sized titles and descriptions', () => {
  const t = new Map(), d = new Map();
  for (const f of indexable) {
    const title = unesc(one(built[f], /<title>([^<]*)<\/title>/g)), desc = unesc(meta(built[f], 'description'));
    assert.ok(title.length >= 15 && title.length <= 70, `${f}: title length ${title.length}`);
    assert.ok(desc.length >= 50 && desc.length <= 170, `${f}: description length ${desc.length}`);
    assert.ok(!t.has(title), `${f}: title duplicates ${t.get(title)}`); t.set(title, f);
    assert.ok(!d.has(desc), `${f}: description duplicates ${d.get(desc)}`); d.set(desc, f);
    for (const p of ['og:title', 'og:description', 'og:url', 'og:image'])
      assert.match(built[f], new RegExp(`<meta property="${p}" content="[^"]+"`), `${f}: ${p}`);
    assert.match(built[f], /<meta name="twitter:card" content="summary_large_image">/, `${f}: twitter card`);
  }
});

test('sitemap.xml lists exactly the indexable pages; robots.txt points to it and blocks none of them', () => {
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).sort();
  const want = indexable.map((f) => SITE + '/' + (f === 'index.html' ? '' : f)).sort();
  assert.deepEqual(locs, want);
  const rb = read('robots.txt');
  assert.match(rb, new RegExp(`^Sitemap: ${SITE.replace(/\./g, '\\.')}/sitemap\\.xml$`, 'm'));
  const dis = [...rb.matchAll(/^Disallow: (\S+)/gm)].map((m) => m[1]);
  for (const f of indexable) assert.ok(!dis.some((p) => ('/' + f).startsWith(p)), `robots.txt blocks ${f}`);
  const ll = read('llms.txt');
  for (const u of want) assert.ok(ll.includes(`(${u})`), `llms.txt lists ${u}`);
});

test('JSON-LD: one parseable @graph per page; Organization + WebSite everywhere; marked-up text is visible', () => {
  for (const f of pages) {
    const g = ld(built[f])['@graph'];
    assert.ok(Array.isArray(g), `${f}: @graph`);
    const types = g.map((x) => x['@type']);
    assert.ok(types.includes('Organization') && types.includes('WebSite'), `${f}: Organization + WebSite`);
    assert.ok(!g.some((x) => x.potentialAction), `${f}: no SearchAction (no public search URL; Google retired the box)`);
    const text = visible(built[f]);
    for (const x of g) {
      if (x['@type'] === 'FAQPage') for (const q of x.mainEntity) {
        assert.ok(text.includes(q.name), `${f}: FAQ question is on the page: ${q.name}`);
        assert.ok(text.includes(q.acceptedAnswer.text.slice(0, 60)), `${f}: FAQ answer is on the page: ${q.name}`);
      }
      if (x['@type'] === 'ItemList') for (const it of x.itemListElement) {
        assert.ok(text.includes(it.item.name) && text.includes(it.item.description), `${f}: ItemList item visible: ${it.item.name}`);
      }
      if (x['@type'] === 'Event') assert.fail(`${f}: hand-written Event markup (events are not server-rendered)`);
    }
    if (indexable.includes(f) && f !== 'index.html') assert.ok(types.includes('BreadcrumbList'), `${f}: breadcrumb`);
  }
  const home = ld(built['index.html'])['@graph'];
  assert.ok(home.find((x) => x['@type'] === 'WebSite' && x.name === site.name && x.url === SITE + '/'), 'home WebSite names the site');
});

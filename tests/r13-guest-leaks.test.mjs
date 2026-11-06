// r13 guest-leaks: what a visitor (signed out) or a guest can see before and after the server answers.
// Runtime proof (headless crawl as visitor / guest / slow-Clerk pending state): tools/guest-crawl.py + work/round13/guest-leaks/REPORT.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const POLICY = JSON.parse(rd('src/data/access-policy.json'));
const PAGES = Object.fromEntries(Object.entries(POLICY.pages).filter(([k, v]) => k !== '$comment' && typeof v === 'string'));
const roles = (action) => (POLICY.actions[action] || {}).roles || [];
const built = readdirSync(new URL('../', import.meta.url)).filter((f) => f.endsWith('.html'));

test('every page the policy gates carries <body data-gate="<action>">; pages closed to guests also carry data-gate-member', () => {
  for (const [page, action] of Object.entries(PAGES)) {
    const h = rd(page + '.html'); const body = h.match(/<body\b[^>]*>/)[0];
    assert.ok(body.includes(`data-gate="${action}"`), `${page}.html: ${body}`);
    assert.equal(body.includes('data-gate-member'), !roles(action).includes('guest'), `${page}.html data-gate-member must match "guest may open it"`);
  }
  for (const f of built) {
    const p = f.slice(0, -5); if (p in PAGES) continue;
    assert.doesNotMatch(rd(f).match(/<body\b[^>]*>/)?.[0] || '', /data-gate/, `${f} is public: no gate marker`);
  }
});

test('nothing role-specific paints while the role is unknown: sidebar links + member-only <main> hidden on role-pending, gated <main> hidden for visitors', () => {
  const css = rd('css/shell.css');
  assert.ok(css.includes('html.role-pending .sbar .sb-nav{visibility:hidden}'));
  assert.ok(css.includes('html.role-pending body[data-gate-member] main,html.role-visitor body[data-gate] main{visibility:hidden}'));
  for (const b of ['css/bundle-app.css', 'css/bundle-dashboard.css']) assert.ok(rd(b).includes('html.role-pending .sbar .sb-nav{visibility:hidden}'), `${b} is rebuilt`);
  // ?static=1 never gets a role-* class (mockups stay pixel-identical): the early script adds role-* only outside static
  const early = rd('index.html').match(/<script>\/\* early:[\s\S]*?<\/script>/)[0];
  assert.match(early, /if\(\/\[\?&\]static\/\.test\(location\.search\)\)d\.classList\.add\("static"\);else\{[\s\S]*role-pending":"role-visitor"/);
});

test('one sidebar per role for guests: every non-guest sidebar ships the guest navigation as an inert template, and it only links pages a guest may open', () => {
  let n = 0;
  for (const f of built) {
    const h = rd(f); const nav = h.match(/<nav class="sb-nav" aria-label="Main" data-nav-role="(\w+)">/); if (!nav) continue;
    if (nav[1] === 'guest') { assert.doesNotMatch(h, /id="sb-nav-guest"/); continue; }
    const tpl = h.match(/<template id="sb-nav-guest">([\s\S]*?)<\/template>/); assert.ok(tpl, `${f}: guest template missing`); n++;
    const hrefs = [...tpl[1].matchAll(/href="([^"#]+)/g)].map((m) => m[1].replace(/^\//, '').replace(/\.html$/, ''));
    assert.ok(hrefs.includes('guest'), `${f}: guest Home link`);
    for (const p of hrefs) if (PAGES[p]) assert.ok(roles(PAGES[p]).includes('guest'), `${f}: guest nav links ${p} which guests cannot open`);
    for (const bad of ['dashboard', 'tutor', 'admin', 'projects', 'launchpad', 'testing', 'competitions', 'groups', 'card', 'builder', 'seller', 'community', 'profile'])
      assert.ok(!hrefs.includes(bad), `${f}: guest nav must not link ${bad}.html`);
  }
  assert.ok(n >= 35, `templates on ${n} pages`);
});

test('access.js swaps the guest navigation in once, keeps aria-current on the page, and announces it (cc:nav)', () => {
  const src = rd('js/access.js');
  const fn = src.slice(src.indexOf('function guestNav()'), src.indexOf('function upgradeCta()'));
  assert.match(fn, /A\.role !== "guest" \|\| nav\.dataset\.navRole === "guest"/);
  assert.match(fn, /nav\.innerHTML = tpl\.innerHTML; nav\.dataset\.navRole = "guest"/);
  assert.match(fn, /aria-current/); assert.match(fn, /cc:nav/);
  assert.ok(src.indexOf('guestNav();') < src.indexOf('.sbar .sb-nav a[href]'), 'swap happens before the per-link policy filter');
  assert.match(rd('js/shell.js'), /document\.addEventListener\("cc:nav", bindTips\)/);
});

test('guestNav at runtime: a guest gets the template links; a learner keeps the built ones', () => {
  const src = rd('js/access.js');
  const run = (role) => {
    const tplHTML = '<a href="guest.html">Home</a><a href="courses.html">Courses</a>';
    const anchors = () => [...nav.innerHTML.matchAll(/href="([^"]+)"/g)].map((m) => ({ getAttribute: () => m[1], setAttribute() {}, removeAttribute() {} }));
    const nav = { innerHTML: '<a href="dashboard.html">Home</a><a href="projects.html">Projects</a>', dataset: { navRole: 'learner' }, querySelectorAll: () => anchors(), querySelector: () => null, insertBefore() {}, firstChild: null };
    const doc = { readyState: 'complete', documentElement: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {} }, body: { dataset: { page: 'courses' } },
      querySelector: (s) => (s === '.sbar .sb-nav' ? nav : s === '#sb-nav-guest' ? { innerHTML: tplHTML } : null), querySelectorAll: () => [], addEventListener() {}, dispatchEvent() {}, createElement: () => ({}) };
    const ctx = { window: {}, document: doc, location: { href: 'https://x.test/courses.html', pathname: '/courses.html', search: '', hash: '', origin: 'https://x.test', replace() {} }, URL, CustomEvent: class { constructor(t) { this.type = t; } }, Promise, console };
    ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
    ctx.CCAccess.set({ role, user: role === 'visitor' ? null : { id: 'u' } });
    return nav.innerHTML;
  };
  assert.match(run('guest'), /guest\.html/); assert.doesNotMatch(run('guest'), /projects\.html|dashboard\.html/);
  assert.match(run('learner'), /projects\.html/);
});

test('events: a guest is offered "Become a learner to submit an event", never the form (the server refuses guests too)', () => {
  const js = rd('js/events.js');
  assert.match(js, /A\.can\("community\.post"\)/);
  assert.match(js, /Become a learner to submit an event/);
  assert.match(js, /A\.authUrl\("\/events\.html", "upgrade=1"\)/);
});

test('signing out forgets per-user browser data on a shared phone, keeps site settings', () => {
  const src = rd('js/auth.js');
  assert.match(src, /signOut: async \(\) => \{ forgetUser\(\);/);
  const re = new RegExp(src.match(/const USER_KEYS = \/(.*)\/;/)[1]);
  for (const k of ['cc_auth_draft', 'cc_ev_tickets', 'cc_cart', 'cc_wish', 'cc_orders', 'cc_rfq', 'cc_saved_x', 'cc_ide_main', 'cc_byok_groq', 'cc_seller_drafts', 'cc_ext_drafts', 'cc_social_draft', 'cc_opp_remind', '101-sessions-stub-v1'])
    assert.ok(re.test(k), `${k} is cleared`);
  for (const k of ['theme', 'lang', 'cc_lang', 'lite', 'cookies', 'cc.sidebar', 'cc_promo_dismissed', 'cc_ann_pin', 'cc_ann_hide', 'cc_bg_motion'])
    assert.ok(!re.test(k), `${k} is a site setting and stays`);
});

test('page guard finds the gate by file name first: ai-tools.html (data-page="aitools") sends visitors to sign in', () => {
  const src = rd('js/access.js');
  const fn = src.slice(src.indexOf('function guardPage()'), src.indexOf('/* any tap on a gated link'));
  assert.match(fn, /A\.pageAction\("\/" \+ byPath \+ "\.html"\) \? byPath : \(byBody \|\| byPath\)/);
  // every gated page is found from its own file name, whatever its data-page says
  for (const page of Object.keys(PAGES)) {
    const dp = (rd(page + '.html').match(/<body\b[^>]*data-page="([^"]+)"/) || [])[1];
    if (dp && dp !== page) assert.ok(!(dp in PAGES) || PAGES[dp] === PAGES[page], `${page}.html data-page="${dp}" names another gate`);
  }
  assert.match(rd('ai-tools.html'), /<body data-gate="ai\.chat"[^>]*data-page="aitools"/);
});

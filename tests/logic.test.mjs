// Round 12 logic: exhaustive / property checks over the access contract.  node --test tests/logic.test.mjs
// Each test states an invariant the founder rules require. Tests marked `todo` are KNOWN COUNTEREXAMPLES on the
// round-11 base (they report but do not fail the run); remove the todo flag when the owning area fixes them.
//   BACKEND_ACCESS=/path/to/backend/lib/access.ts node --experimental-strip-types --test tests/logic.test.mjs  (adds JS<->TS parity)
//   PLAN_TIERS=/path/to/plan_tiers.json (snapshot of public.plan_tiers) adds front-default <-> DB limit parity.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../js/access.js', import.meta.url), 'utf8');
const policy = JSON.parse(readFileSync(new URL('../src/data/access-policy.json', import.meta.url), 'utf8'));
const ROLES = policy.roles, PLANS = policy.plans, ACTIONS = Object.keys(policy.actions).filter((k) => k[0] !== '$');
const PAGES = Object.fromEntries(Object.entries(policy.pages).filter(([k]) => k[0] !== '$'));

function load(href = 'https://x.test/index.html') {
  const document = {
    readyState: 'complete', body: { dataset: { page: (new URL(href).pathname.match(/([a-z0-9-]+)\.html$/) || [, 'index'])[1] } },
    documentElement: { classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, dataset: {} },
    querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, dispatchEvent: () => true, createElement: () => ({}),
  };
  const replaced = [];
  const location = Object.assign(new URL(href), { replace: (u) => replaced.push(u) });
  const window = {};
  vm.runInContext(src, vm.createContext({ window, document, location, URL, CustomEvent: class { constructor(t, o) { this.detail = o && o.detail; } }, Promise, console }));
  return { A: window.CCAccess, replaced };
}
const pageOf = (u) => { const m = String(u).match(/\/([a-z0-9-]+)(?:\.html)?(?:[?#]|$)/); return m ? m[1] : 'index'; };
const signed = (r) => r !== 'visitor';

// ------------------------------------------------------------------ L-A1 --
test('L-A1 page guard: for every role x gated page, the redirect target is a different page that role can open (no loop, no dead end)', () => {
  const bad = [];
  for (const role of ROLES) for (const [page, action] of Object.entries(PAGES)) {
    const { A, replaced } = load(`https://x.test/${page}.html`);
    A.set({ role, user: signed(role) ? { id: 'u' } : null, plan: 'free' });
    if (A.can(action)) { if (replaced.length) bad.push(`${role}@${page}: allowed but redirected to ${replaced[0]}`); continue; }
    if (!replaced.length) { bad.push(`${role}@${page}: denied but not redirected`); continue; }
    const to = pageOf(replaced[0]);
    if (to === page) bad.push(`${role}@${page}: redirects to itself`);
    const act2 = PAGES[to];
    if (to !== 'auth' && act2 && !A.can(act2)) bad.push(`${role}@${page} -> ${to}: target is also denied (chain)`);
  }
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------------ L-A2 --
test('L-A2 every page gate uses a VIEW action (never a write action), so viewing and acting are separable', { todo: 'groups.html is gated by community.post: unconsented minors cannot even read groups' }, () => {
  const writeish = /\.(post|create|sell|submit|build|book|register|send|rate)$/;
  const bad = Object.entries(PAGES).filter(([, a]) => writeish.test(a) && a !== 'course.build').map(([p, a]) => `${p} <- ${a}`);
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------------ L-A3 --
// Keys that name the SAME capability (by their comments / page use). Aliases must carry identical rules; better, merge them.
const ALIASES = [
  ['course.enroll', 'course.take_tutor'],                 // comment: "Alias of the owner's course.take_tutor"
  ['rating.create', 'course.rate', 'resource.rate'],      // all ratings need verified use
  ['account.guardian', 'guardian.manage'],
  ['account.payouts', 'payout.manage'],
  ['dashboard.learner', 'dashboard.learner_view'],
  ['dashboard.tutor', 'dashboard.tutor_view'],
  ['course.build', 'course.create'],                     // builder.html is the only place a course is created
  ['profile.share', 'profile.public'],                    // sharing a card/PDF publishes the profile
];
test('L-A3 alias keys carry identical rules (otherwise the same capability is allowed by one key and denied by the other)', { todo: 'payout.manage(minor deny) vs account.payouts; dashboard.*_view admit staff; course.create admits admins but course.build does not; profile.share has no minor rule' }, () => {
  const sig = (a) => { const r = policy.actions[a]; return JSON.stringify([r.roles.slice().sort(), (r.plans || []).slice().sort(), r.minor || null]); };
  const bad = ALIASES.filter((g) => new Set(g.map(sig)).size > 1).map((g) => g.map((a) => `${a}=${sig(a)}`).join('  vs  '));
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------------ L-A4 --
test('L-A4 monotonicity: a higher plan never loses an action a lower plan has (same role, minor, consent)', () => {
  const rank = (p) => PLANS.indexOf(p), bad = [];
  for (const role of ROLES) for (const minor of [false, true]) for (const consent of [false, true]) for (const a of ACTIONS)
    for (const p of PLANS) for (const q of PLANS) if (rank(q) > rank(p)) {
      const { A } = load();
      const lo = A.can(a, { role, plan: p, minor, consent }), hi = A.can(a, { role, plan: q, minor, consent });
      if (lo && !hi) bad.push(`${role}/${a}: ${p} yes, ${q} no`);
    }
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------------ L-A5 --
test('L-A5 numeric limits never shrink when the plan grows (null = unlimited is the top)', () => {
  const v = (x) => (x === null ? Infinity : x === true ? 1 : x === false ? 0 : x), bad = [];
  const lowerIsBetter = new Set(['commission.pct', 'seller.fee_pct', 'payout.min_ugx']);
  for (const [aud, tiers] of Object.entries(policy.limits)) {
    const order = PLANS.filter((p) => tiers[p]);
    const keys = new Set(order.flatMap((p) => Object.keys(tiers[p])));
    for (const k of keys) for (let i = 1; i < order.length; i++) {
      const a = v(tiers[order[i - 1]][k] ?? null), b = v(tiers[order[i]][k] ?? null);
      if (lowerIsBetter.has(k) ? b > a : b < a) bad.push(`${aud}.${k}: ${order[i - 1]}=${tiers[order[i - 1]][k]} -> ${order[i]}=${tiers[order[i]][k]}`);
    }
  }
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------------ L-A6 --
test('L-A6 every audience has the same limit keys on every tier (a missing key means "0" on the server, "unlimited" on the client)', () => {
  const bad = [];
  for (const [aud, tiers] of Object.entries(policy.limits)) {
    const all = new Set(Object.values(tiers).flatMap((t) => Object.keys(t)));
    for (const [tier, row] of Object.entries(tiers)) for (const k of all) if (!(k in row)) bad.push(`${aud}.${tier} missing ${k}`);
  }
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------------ L-A7 --
test('L-A7 JS why() and backend decide() agree on every (role, plan, minor, consent in {true,false,undefined}, action)', { skip: !process.env.BACKEND_ACCESS && 'set BACKEND_ACCESS', todo: 'consent undefined: JS denies ("consent"), TS allows (decide checks consent === false)' }, async () => {
  const be = await import(process.env.BACKEND_ACCESS);
  const { A } = load(), bad = [];
  for (const role of ROLES) for (const plan of PLANS) for (const minor of [false, true]) for (const consent of [true, false, undefined]) for (const a of [...ACTIONS, 'nope.x']) {
    const ctx = { role, plan, minor }; if (consent !== undefined) ctx.consent = consent;
    const j = A.why(a, ctx), t = be.decide(ctx, a);
    if (j !== t) bad.push(`${JSON.stringify(ctx)} ${a}: js=${j} ts=${t}`);
  }
  assert.deepEqual(bad.slice(0, 10), [], `${bad.length} disagreements`);
});

// ------------------------------------------------------------------ L-A8 --
test('L-A8 the three backend role resolvers agree (resolveRole / accessRole / lib/auth accessCtx semantics)', { skip: !process.env.BACKEND_ACCESS && 'set BACKEND_ACCESS', todo: 'accessRole ignores the verified email: root email without a DB row -> guest (resolveRole: root_admin); stray super_admin -> root_admin (resolveRole: admin)' }, async () => {
  const be = await import(process.env.BACKEND_ACCESS);
  const sets = [[], ['guest'], ['learner'], ['tutor'], ['learner', 'tutor'], ['admin'], ['super_admin'], ['admin', 'tutor'], ['super_admin', 'learner']];
  const bad = [];
  for (const dbRoles of sets) for (const [email, verified] of [['101codecrafts@gmail.com', true], ['someone@example.com', true], ['101codecrafts@gmail.com', false]]) {
    const r1 = be.resolveRole({ dbRoles, email, emailVerified: verified, onboarded: true });
    const r2 = be.accessRole(true, dbRoles);
    if (r1 !== r2) bad.push(`${JSON.stringify(dbRoles)} ${email}/${verified}: resolveRole=${r1} accessRole=${r2}`);
  }
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------------ L-A9 --
test('L-A9 front default limits equal the live DB plan_tiers (what the pricing page sells == what CCAccess.limit shows)', { skip: !process.env.PLAN_TIERS && 'set PLAN_TIERS', todo: 'learner sessions.per_month exists only in the front policy; /auth/session limits come from the bundled JSON, not plan_tiers' }, () => {
  const rows = JSON.parse(readFileSync(process.env.PLAN_TIERS, 'utf8')), bad = [];
  for (const r of rows) {
    const front = policy.limits[r.audience]?.[r.tier] || {}, dbKeys = new Set(r.keys.split(','));
    for (const k of Object.keys(front)) if (!dbKeys.has(k)) bad.push(`${r.audience}.${r.tier}: '${k}' in front policy, absent in DB (server plan_limit -> 0)`);
    for (const k of dbKeys) if (!(k in front)) bad.push(`${r.audience}.${r.tier}: '${k}' in DB, absent in front policy (client limit -> null = unlimited)`);
  }
  assert.deepEqual(bad, []);
});

// ------------------------------------------------------------------ L-A10 -
test('L-A10 sidebar: one navigation per role (the built sidebar template must not depend on the page)', { todo: '35 shared pages bake the LEARNER sidebar; tutors/admins/guests see a different nav per page (REPORT N1)' }, () => {
  const dir = new URL('../src/', import.meta.url), tpl = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
    const m = readFileSync(new URL(f, dir), 'utf8').match(/\{\{SIDEBAR role="(\w+)"/);
    if (m) (tpl[m[1]] = tpl[m[1]] || []).push(f);
  }
  const shared = Object.entries(PAGES).filter(([, a]) => ['shell.app', 'shell.full', 'course.browse', 'practice.use', 'market.browse', 'market.buy', 'resource.open', 'ai.chat'].includes(a)).map(([p]) => p + '.html');
  const baked = shared.filter((p) => Object.entries(tpl).some(([r, fs]) => r !== 'guest' && fs.includes(p)));
  assert.deepEqual(baked, [], 'pages every role can open but whose sidebar is fixed at build time');
});

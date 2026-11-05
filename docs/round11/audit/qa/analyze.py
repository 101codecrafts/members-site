# Build ROUTES.md + findings.json from the crawl output (qa/out/<role>-<width>/*.json).
import json, glob, os, collections, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from policy import ROLES, PAGES, HOME, should, page_of
Q = os.path.dirname(os.path.abspath(__file__))
CFG = ['visitor-1440', 'visitor-412', 'learner-1440', 'learner-412']
data = collections.defaultdict(dict)   # page -> cfg -> json
for c in CFG:
    for f in glob.glob(f'{Q}/out/{c}/*.json'):
        d = json.load(open(f)); data[d['page']][c] = d

def now_of(e):
    h = e.get('href') or ''
    if e['tag'] == 'a' and h and not h.startswith('#') and not h.lower().startswith('javascript'): return h
    eff = e.get('effect')
    if eff is None: return 'not clicked' if e['vis'] else 'hidden'
    if eff == 'anchor': return h + ' (in-page)'
    if eff.startswith('dom:'): return 'opens/changes UI'
    return eff

def norm_text(t):
    t = re.sub(r'\b\d[\d,.]*\b', 'N', t or '').strip()
    return t[:60]

# ---------- per element merge ----------
shell = collections.OrderedDict()   # key -> {text, zone, now:{cfg:set}, pages:set}
perpage = collections.defaultdict(collections.OrderedDict)
for page, cfgs in sorted(data.items()):
    for c, d in cfgs.items():
        for e in d.get('elements', []):
            if not e['vis']: continue
            k = (e['zone'], norm_text(e['text']), (e.get('href') or '').split('?')[0] if e['tag'] == 'a' else '')
            target = shell if e['zone'] in ('sidebar', 'top', 'account', 'footer') else perpage[page]
            r = target.setdefault(k, {'text': e['text'], 'zone': e['zone'], 'tag': e['tag'], 'href': e.get('href') or '', 'now': collections.defaultdict(set), 'pages': set(), 'cursor': e.get('cursor')})
            r['now'][c].add(now_of(e)); r['pages'].add(page)
# shell entries seen on few pages are page-specific after all
for k in list(shell):
    if len(shell[k]['pages']) < 4:
        r = shell.pop(k)
        for p in r['pages']: perpage[p][k] = r

def cell(s): return '<br>'.join(sorted(s))[:120] if s else '—'
def esc(s): return str(s).replace('|', '\\|').replace('\n', ' ')

def row_md(r, page):
    nv = r['now'].get('visitor-1440', set()) | r['now'].get('visitor-412', set())
    nl = r['now'].get('learner-1440', set()) | r['now'].get('learner-412', set())
    sh = []
    for role in ROLES:
        s = should(role, r['text'], r['href'], r['zone'], page)
        sh.append(s or ('same as now' if r['tag'] != 'a' or not r['href'] or r['href'].startswith('#') else page_of(r['href']) or '?'))
    # compress identical should values
    if len(set(sh)) == 1: shs = f'all roles: {sh[0]}'
    else:
        shs = '; '.join(f'**{ro}**: {v}' for ro, v in zip(ROLES, sh))
    flag = ''
    allnow = nv | nl
    if any(x in ('NO-OP', 'click-failed') for x in allnow): flag = '🔴 dead'
    elif any(x.startswith('dialog:') for x in allnow): flag = '🟠 stub alert'
    elif r['tag'] == 'a' and not r['href']: flag = '🔴 no href'
    widths = ''
    return f"| {esc(r['zone'])} | {esc(r['text'][:48])} | {esc(cell(nv))} | {esc(cell(nl))} | {esc(shs)} | {flag} |"

out = ['# ROUTES.md: route and click map (round 11 audit)', '',
       'Live site audited 5 Nov 2026 (EAT) at main **f33b32b** (static domain `members-site-staging.vercel.app`, backend 3f36f1a on the protected alias).',
       '"Now" = what the element does today: its href, or the effect of clicking it (`opens/changes UI`, `NO-OP` = nothing happened, `dialog:` = browser alert, `nav:` = JS navigation, `popup:` = new tab).',
       '**visitor** = public static domain, no session. **signed-in** = protected alias as the QA Learner (Clerk dev user, account_status=pending, roles=[]). Columns merge 412 and 1440 px.',
       '**Tutor / admin / root "now" = the signed-in column.** f33b32b has no role-based routing at all: every page renders the same markup for every signed-in user; the only role-aware bit is the account-menu "Switch role" tabs, shown when GET /v1/me returns more than one role (js/auth.js `roles()`). Verified by code read, not by a live tutor/admin/root account (none exist besides the founder\'s).',
       '"Should" applies the founder rules in BRIEF.md (qa/policy.py). `auth` = the join flow with a return-to. Guest home does not exist yet.', '',
       '## Role homes (should)', '', '| role | lands on after sign-in (should) | lands on today |', '|---|---|---|']
for r in ROLES:
    today = 'index.html (signed out)' if r == 'visitor' else 'dashboard.html (Clerk signInForceRedirectUrl, same for every role) · sign-up → onboarding.html → dashboard.html or tutor.html by the button picked'
    out.append(f'| {r} | {HOME[r]} | {today} |')
out += ['', '## Page access: today vs should', '',
        '| page | today, visitor | today, signed-in | ' + ' | '.join(ROLES) + ' |', '|---|---|---|' + '---|' * len(ROLES)]
for page in sorted(set(list(data) + list(PAGES))):
    cf = data.get(page, {})
    def today(c):
        d = cf.get(c)
        if not d: return 'not crawled'
        st = d.get('state', {})
        bits = [str(d.get('status'))]
        if st.get('url') and page.split('?')[0] not in st['url']: bits.append('→ ' + st['url'].rsplit('/', 1)[-1])
        if st.get('sidebarVisible') or st.get('hamburger'): bits.append('app shell+sidebar')
        if st.get('fakeNames') or st.get('money'): bits.append('demo data')
        return ', '.join(bits)
    pol = PAGES.get(page, {})
    out.append(f"| {page} | {today('visitor-1440')} | {today('learner-1440')} | " + ' | '.join(esc(pol.get(r, '?')) for r in ROLES) + ' |')
out += ['', '## Global shell (sidebar, top bar, account menu, footer): elements on 4+ pages', '',
        '| zone | element | now: visitor | now: signed-in | should | flag |', '|---|---|---|---|---|---|']
for k, r in shell.items():
    out.append(row_md(r, 'dashboard.html') + f' <!-- {len(r["pages"])} pages -->')
out += ['', '## Per page (page-specific elements)', '']
for page in sorted(perpage):
    rows = perpage[page]
    if not rows: continue
    out += [f'### {page}', '', '| zone | element | now: visitor | now: signed-in | should | flag |', '|---|---|---|---|---|---|']
    for k, r in rows.items(): out.append(row_md(r, page))
    out.append('')
open(os.path.join(Q, '..', 'ROUTES.md'), 'w').write('\n'.join(out) + '\n')

# ---------- findings for DEFECTS ----------
F = collections.defaultdict(list)
for page, cfgs in sorted(data.items()):
    for c, d in cfgs.items():
        st = d.get('state') or {}
        if not st: F['crawl_error'].append((page, c, d.get('error', '')[:120])); continue
        if c.startswith('visitor') and (st.get('sidebarVisible') or st.get('hamburger')): F['sidebar_visitor'].append((page, c))
        if st.get('gridPts', '').startswith('0/'): F['no_grid'].append((page, c, st.get('cover', [])[:2]))
        if c.startswith('learner') and (st.get('fakeNames') or st.get('money')): F['demo_signed_in'].append((page, c, st.get('fakeNames')[:5], st.get('money')[:3]))
        if c.startswith('visitor') and (st.get('fakeNames') or st.get('money')): F['demo_visitor'].append((page, c, st.get('fakeNames')[:5], st.get('money')[:3]))
        if st.get('quick'): F['quick_actions'].append((page, c, st['quick'][:8]))
        if st.get('scrollW', 0) > st.get('vw', 0) + 1: F['overflow'].append((page, c, st['scrollW'], st['vw']))
        if c.startswith('learner'): F['acct_role'].append((page, c, st.get('names'), st.get('acctRole')))
        for e in d.get('elements', []):
            eff = e.get('effect') or ''
            if eff in ('NO-OP', 'click-failed'): F['dead'].append((page, c, e['zone'], e['text'][:50], e['tag'], e.get('href', '')))
            if eff.startswith('dialog:'): F['dialog'].append((page, c, e['text'][:50], eff[7:120]))
            if e['vis'] and e['tag'] == 'a' and not e.get('href') and not eff.startswith(('nav:', 'popup:')): F['a_nohref'].append((page, c, e['zone'], e['text'][:50], eff))
            if e['vis'] and e['tag'] == 'a' and e.get('href') == '#': F['hash_href'].append((page, c, e['text'][:50], eff))
        F['api'].append((page, c, [a for a in d.get('api', []) if not a.startswith('200')][:8]))
# same label -> different destination, same role (per crawl config)
for c in CFG:
    lab = collections.defaultdict(lambda: collections.defaultdict(set))
    for page, cfgs in data.items():
        d = cfgs.get(c)
        if not d: continue
        for e in d.get('elements', []):
            if e['vis'] and e['tag'] == 'a' and e.get('href') and not e['href'].startswith('#'):
                t = norm_text(e['text']).lower()
                if t and len(t) < 40: lab[t][page_of(e['href']) or e['href']].add(page)
    for t, dd in lab.items():
        if len(dd) > 1: F['inconsistent'].append((c, t, {k: sorted(v)[:3] + (['…'] if len(v) > 3 else []) for k, v in dd.items()}))
json.dump(F, open(os.path.join(Q, 'findings.json'), 'w'), indent=1, default=list)
print({k: len(v) for k, v in F.items()})

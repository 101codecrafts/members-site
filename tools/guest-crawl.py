"""r13 guest-leaks regression crawl (Playwright, headless Chromium). No network: serves SITE locally, fakes Clerk and
GET /api/v1/auth/session per role, answers every other /api call 401 (visitor) or an empty envelope (signed in), so a
page can only show what its own HTML/JS paints for that role. Clerk is delayed 2.5 s, like a phone on mobile data,
and each page is also probed at 600 ms (the "pending" state before the role is known).

usage: python3 tools/guest-crawl.py SITE_DIR [OUT.json]      (exit 1 on any leak)
env:   CHROME=/path/to/chrome  PAGES="admin dashboard ..."  (default: every page the policy gates + public pages)
Checks, per role:
  visitor  never sees a sidebar; every gated page ends on /auth.html?next=…; a gated page's <main> is invisible while
           the redirect is pending; no admin/tutor/learner dashboard words in any visible text.
  guest    member-only pages redirect away; the visible sidebar links only pages a guest may open (guest navigation);
           while pending (first 600 ms) no sidebar link and no member-only <main> is visible.
  learner  keeps the learner sidebar (Projects, Groups) on shared pages: the fix must not strip members.
"""
import sys, os, json, re, asyncio, functools, http.server, socketserver, threading
from urllib.parse import urlparse
from playwright.async_api import async_playwright

SITE = os.path.abspath(sys.argv[1]); OUT = sys.argv[2] if len(sys.argv) > 2 else None
POLICY = json.load(open(os.path.join(SITE, 'src/data/access-policy.json')))
PAGES_POL = {k: v for k, v in POLICY['pages'].items() if k != '$comment' and isinstance(v, str)}
ROLES_OF = lambda a: POLICY['actions'].get(a, {}).get('roles', [])
# marketing/legal pages describe member features in prose (plan tables list "Certificates", terms cover payouts, a public
# profile shows its owner's certificates): the role-word check skips them; it is meant for app pages a visitor can open.
PROSE = {'about', 'pricing', 'privacy', 'terms', 'profile'}
PUBLIC = ['index', 'about', 'pricing', 'events', 'news', 'opportunities', 'community', 'profile', 'privacy', 'terms']
PAGES = os.environ.get('PAGES', '').split() or sorted(PAGES_POL) + PUBLIC
WORDS = re.compile(r'admin console|approvals? queue|audit log|support view|earnings|payouts?\b|my learners|course builder|my courses|my projects|certificates|seller centre|organiser view|attendees', re.I)
FAKE_CLERK = r"""(function(){var e=null;try{e=sessionStorage.getItem('fakeUser')}catch(x){}var L=[];var C={loaded:false,user:null,session:null,
load:async function(){C.loaded=true;if(e){C.user={id:'user_qa',primaryEmailAddress:{emailAddress:e},fullName:'QA',firstName:'',hasImage:false,imageUrl:''};C.session={getToken:async function(){return 'tok'}}}},
addListener:function(f){L.push(f)},signOut:async function(){},client:{sessions:[]}};window.Clerk=C;})();"""
SESSION = lambda r: {'user': {'id': 'user_qa', 'email': 'qa@example.com', 'name': 'QA', 'image': None}, 'role': r, 'roles': [] if r == 'guest' else [r],
                     'plan': 'free', 'minor': False, 'consent': True, 'status': 'active', 'onboarding': {'completed': True}}
PROBE = """() => { const vis = el => { if (!el) return false; const cs = getComputedStyle(el); if (cs.display==='none'||cs.visibility==='hidden') return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
  const sb = document.querySelector('.sbar'); const main = document.querySelector('main');
  return { url: location.pathname + location.search, sidebar: vis(sb),
    links: sb ? [...sb.querySelectorAll('.sb-nav a[href]')].filter(vis).map(a => a.getAttribute('href').replace(/^\\//,'').split(/[?#]/)[0]) : [],
    main: vis(main), text: main && vis(main) ? main.innerText.slice(0, 20000) : '' }; }"""

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
socketserver.TCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(H, directory=SITE)); BASE = f'http://127.0.0.1:{srv.server_address[1]}'
threading.Thread(target=srv.serve_forever, daemon=True).start()

async def context(b, role):
    ctx = await b.new_context(viewport={'width': 1280, 'height': 900}, service_workers='block', reduced_motion='reduce')
    if role != 'visitor':
        await ctx.add_init_script("try{sessionStorage.setItem('fakeUser','qa@example.com')}catch(e){}; document.cookie='__client_uat=1700000000; path=/';")
    async def any_(r):
        u = r.request.url
        if u.startswith(BASE) and '/api/' not in u: return await r.continue_()
        if u.startswith(BASE + '/api/'):
            if role == 'visitor': return await r.fulfill(status=401, content_type='application/json', body='{"error":{"code":"unauthenticated"}}')
            if '/auth/session' in u: return await r.fulfill(status=200, content_type='application/json', body=json.dumps({'data': SESSION(role)}))
            return await r.fulfill(status=200, content_type='application/json', body='{"data":[]}')
        if '/npm/@clerk/clerk-js' in u:
            await asyncio.sleep(2.5); return await r.fulfill(status=200, content_type='application/javascript', body=FAKE_CLERK)
        if '/npm/@clerk/ui' in u: return await r.fulfill(status=200, content_type='application/javascript', body='')
        return await r.abort()
    await ctx.route('**/*', any_)
    return ctx

async def main():
    fails, res = [], {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=os.environ.get('CHROME') or None, args=['--no-sandbox'])
        for role in ('visitor', 'guest', 'learner'):
            ctx = await context(b, role); res[role] = {}
            for pg in PAGES:
                page = await ctx.new_page()
                await page.goto(f'{BASE}/{pg}.html', wait_until='domcontentloaded')
                await page.wait_for_timeout(600)
                early = await page.evaluate(PROBE)
                SH = os.environ.get('SHOTS'); shot = SH and pg in ('admin', 'tutor', 'dashboard', 'courses', 'events', 'seller', 'projects', 'marketplace')
                if shot: os.makedirs(SH, exist_ok=True); await page.screenshot(path=f'{SH}/{role}-{pg}-early.png')
                await page.wait_for_timeout(4200)
                try: final = await page.evaluate(PROBE)
                except Exception: await page.wait_for_timeout(1500); final = await page.evaluate(PROBE)
                if shot: await page.screenshot(path=f'{SH}/{role}-{pg}-final.png')
                await page.close()
                act = PAGES_POL.get(pg); allowed = act is None or role in ROLES_OF(act)
                res[role][pg] = {'early': {k: early[k] for k in ('url', 'sidebar', 'links', 'main')}, 'final': {k: final[k] for k in ('url', 'sidebar', 'links', 'main')}}
                bad = lambda m: fails.append(f'{role} {pg}: {m}')
                if role == 'visitor':
                    if final['sidebar'] or early['sidebar']: bad('sidebar visible to a signed-out visitor')
                    if act and not final['url'].startswith('/auth.html'): bad(f'gated page not redirected to sign-in (ended on {final["url"]})')
                    if act and early['main'] and early['url'].startswith('/' + pg): bad('gated <main> painted before the redirect')
                    m = WORDS.search(early['text'] + ' ' + final['text']) if not act and pg not in PROSE else None
                    if m: bad(f'role words visible: "{m.group(0)}"')
                if role == 'guest':
                    if not allowed and final['url'].startswith('/' + pg + '.html'): bad('member-only page did not redirect')
                    for l in final['links']:
                        la = PAGES_POL.get(l.replace('.html', ''))
                        if la and 'guest' not in ROLES_OF(la): bad(f'sidebar links {l} (guests cannot open it)')
                        if l.replace('.html', '') in ('community', 'profile', 'dashboard'): bad(f'sidebar shows the learner link {l}')
                    if early['url'].startswith('/' + pg) and early['links']: bad(f'sidebar links visible while the role is pending: {early["links"][:4]}')
                    if not allowed and early['url'].startswith('/' + pg) and early['main']: bad('member-only <main> visible while the role is pending')
                if role == 'learner' and pg == 'courses' and not {'projects.html', 'groups.html'} <= set(final['links']): bad(f'learner lost member links: {final["links"]}')
            await ctx.close()
        await b.close()
    if OUT: json.dump({'fails': fails, 'pages': res}, open(OUT, 'w'), indent=1)
    print('\n'.join(fails) or 'no leaks'); print(f'{len(fails)} leak(s) across {len(PAGES)} pages x 3 roles')
    sys.exit(1 if fails else 0)
asyncio.run(main())

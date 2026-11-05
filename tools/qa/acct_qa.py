"""Account menu / profile / settings QA (round 11). A fake Clerk (served in place of the Clerk FAPI scripts) and a mocked
/api/v1 exercise the REAL page code for: visitor, a fresh learner (empty profile), a tutor with data.
usage: python3 acct_qa.py PORT OUTDIR [widths=412,1440] [themes=light,dark]"""
import sys, json, asyncio, os, re
sys.path.insert(0, '/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/uifix')
from shoot import EXE
import urllib.request, hashlib
from playwright.async_api import async_playwright

PORT = int(sys.argv[1]); OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
WIDTHS = [int(x) for x in (sys.argv[3] if len(sys.argv) > 3 else '412,1440').split(',')]
THEMES = (sys.argv[4] if len(sys.argv) > 4 else 'light,dark').split(',')

FAKE_CLERK = r"""(function(){var U=window.__FAKE_USER;
 var mk=function(u){if(!u)return null;return Object.assign({id:'user_1',hasImage:false,imageUrl:'',createdAt:'2026-10-01T08:00:00Z',twoFactorEnabled:false,passwordEnabled:false,externalAccounts:[],
  primaryEmailAddress:{emailAddress:u.email},primaryPhoneNumber:null,
  getSessions:async function(){return [{id:'sess_1',lastActiveAt:'2026-11-05T08:00:00Z',latestActivity:{browserName:'Chrome',browserVersion:'142.0',isMobile:true,city:'Kampala',country:'UG',deviceType:'Android'},revoke:async function(){}},
                                   {id:'sess_2',lastActiveAt:'2026-11-03T08:00:00Z',latestActivity:{browserName:'Firefox',browserVersion:'140.1',isMobile:false,city:'Entebbe',country:'UG'},revoke:async function(){window.__revoked=1}}]},
  setProfileImage:async function(){window.__avatarSet=1},reload:async function(){},update:async function(x){window.__userUpdate=x}},u)};
 window.Clerk={user:mk(U),session:U?{id:'sess_1',getToken:async function(){return 'tok'}}:null,client:{signedInSessions:[]},
  load:async function(){},addListener:function(){},signOut:async function(){window.__signedOut=1},openUserProfile:function(){window.__openedProfile=1},mountSignIn:function(){},mountSignUp:function(){},setActive:async function(){}};
})();"""
UI_STUB = "window.__internal_ClerkUICtor=function(){};"

def mock_api(persona):
  base = {'learner_fresh': {'profile': {'display_name': 'Aisha Nakato', 'username': None, 'skills': [], 'is_public': False}, 'roles': ['learner'], 'account_status': 'active', 'plan': 'free'},
          'tutor': {'profile': {'display_name': 'Brian Okello', 'username': 'brian_ok', 'headline': 'Tutor · Python and data', 'bio': 'I teach Python to O-Level and university learners.', 'skills': ['Python', 'Pandas', 'SQL'],
                    'education_level': 'university', 'institution': 'Makerere University', 'github_username': 'brianok', 'linkedin_url': 'https://www.linkedin.com/in/brianok', 'is_public': True, 'location': 'Kampala'},
                    'roles': ['tutor'], 'account_status': 'active', 'plan': 'standard'}}[persona]
  async def h(route):
    u = route.request.url; m = route.request.method; path = re.sub(r'^https?://[^/]+', '', u).split('?')[0]
    J = lambda d, s=200: route.fulfill(status=s, body=json.dumps(d), headers={'content-type': 'application/json'})
    if path == '/api/v1/me' and m == 'GET': return await J({'data': base})
    if path == '/api/v1/me' and m == 'PATCH': return await J({'data': {'ok': True}})
    if path == '/api/v1/me/notification-preferences': return await J({'data': {'in_app': {}, 'email': {'gamification': False}, 'digest_frequency': 'weekly'}})
    if path == '/api/v1/me/payments': return await J({'data': [] if persona != 'tutor' else [{'created_at': '2026-11-01T10:00:00Z', 'purpose': 'course_purchase', 'amount_ugx': 15000, 'status': 'successful'}]})
    if path == '/api/v1/me/certificates': return await J({'data': [] if persona != 'tutor' else [{'verify_code': '101-AB12-CD34', 'title': 'Python Foundations', 'issued_at': '2026-10-20T10:00:00Z'}]})
    if path == '/api/v1/me/delete' and m == 'GET': return await J({'data': None})
    if path == '/api/v1/me/delete' and m == 'POST': return await J({'error': {'code': 'reverification_required', 'message': 'reverification required'}}, 403)
    if path.startswith('/api/v1/portfolio/'):
      if persona == 'tutor': return await J({'data': {'profile': base['profile'], 'badges': [{'awarded_at': '2026-10-02T00:00:00Z', 'badges': {'code': 'first_lesson', 'name': 'First lesson'}}], 'certificates': [], 'projects': [], 'tutor': {'expertise': ['python']}}})
      return await J({'error': {'code': 'not_found'}}, 404)
    if path.startswith('/api/'): return await J({'error': {'code': 'not_found'}}, 404)   # unknown API = absent (static domain)
    return await route.continue_()
  return h

CACHE = '/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/uifix/cdncache'
async def common(route):
  u = route.request.url
  if 'clerk.accounts.dev' in u:
    return await route.fulfill(body=UI_STUB if 'ui.browser' in u else FAKE_CLERK, headers={'content-type': 'application/javascript'})
  if u.startswith('http://127.0.0.1'): return None
  if 'cdn.jsdelivr.net' in u:
    f = CACHE + '/' + hashlib.md5(u.encode()).hexdigest()
    if not os.path.exists(f):
      try: open(f, 'wb').write(urllib.request.urlopen(u, timeout=10).read())
      except Exception: return await route.abort()
    return await route.fulfill(body=open(f, 'rb').read(), headers={'content-type': 'text/css' if u.endswith('.css') else 'application/javascript', 'access-control-allow-origin': '*'})
  return await route.abort()

RES = {}
def check(k, ok, info=''):
  RES[k] = {'ok': bool(ok), 'info': info}; print(('PASS ' if ok else 'FAIL ') + k, info, flush=True)

async def run():
  async with async_playwright() as p:
    br = await p.chromium.launch(executable_path=EXE, args=['--no-sandbox'])
    for w in WIDTHS:
      mob = w < 800
      for th in THEMES:
        for persona in ('visitor', 'learner_fresh', 'tutor'):
          ctx = await br.new_context(viewport={'width': w, 'height': 860 if mob else 900}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob, accept_downloads=True)
          api = mock_api('tutor' if persona == 'tutor' else 'learner_fresh')
          def mkroute(api):
            async def route(r):
              u = r.request.url
              if u.startswith('http://127.0.0.1'):
                return await (api(r) if '/api/' in u else r.continue_())
              return await common(r)
            return route
          await ctx.route('**/*', mkroute(api))
          user = 'null' if persona == 'visitor' else json.dumps({'fullName': 'Aisha Nakato' if persona == 'learner_fresh' else 'Brian Okello', 'firstName': 'Aisha', 'email': 'aisha@example.com' if persona == 'learner_fresh' else 'brian@example.com'})
          await ctx.add_init_script("localStorage.setItem('cookies','essential');sessionStorage.setItem('cc_demo_seen','1');localStorage.setItem('theme','%s');window.__FAKE_USER=%s;" % (th, user))
          tag = f'{persona}-{w}-{th}'
          q = await ctx.new_page(); errs = []
          q.on('pageerror', lambda e, errs=errs: errs.append(str(e)[:160]))
          # 1) dashboard: chip + menu
          await q.goto(f'http://127.0.0.1:{PORT}/dashboard.html', wait_until='load'); await q.wait_for_timeout(1800)
          st = await q.evaluate("""(()=>{const g=document.querySelector('.acct-guest'),u=document.querySelector('.acct-user');return {guest:g&&!g.hidden,user:u&&!u.hidden,
             name:(document.querySelector('.acct-btn .acct-name')||{}).textContent||'',role:(document.querySelector('.acct-btn .acct-role')||{}).textContent||'',signin:[...document.querySelectorAll('.acct-guest a')].map(a=>a.textContent.trim())}})()""")
          if persona == 'visitor':
            check(f'chip-visitor-join-signin|{tag}', st['guest'] and not st['user'] and 'Sign in' in st['signin'] and any('Join' in s for s in st['signin']), st)
          else:
            nm = 'Aisha Nakato' if persona == 'learner_fresh' else 'Brian Okello'
            check(f'chip-real-user|{tag}', st['user'] and st['name'] == nm, st)
            if not mob or True:
              await q.click('.acct-btn'); await q.wait_for_timeout(300)
              mi = await q.evaluate("""(()=>{const m=document.getElementById('acct-menu');const vis=[...m.querySelectorAll('[role=menuitem]')].filter(i=>i.offsetParent).map(i=>i.textContent.replace(/\\s+/g,' ').trim());
                const r=m.getBoundingClientRect();return {open:!m.hidden,items:vis,head:m.querySelector('.am-head .acct-name').textContent,email:m.querySelector('.acct-email').textContent,plan:m.querySelector('[data-acct-plan]').textContent,
                inView:r.left>=0&&r.right<=innerWidth+1,av:m.querySelector('.am-av').textContent}})()""")
              need = ['View profile', 'Edit profile', 'Billing & payment methods', 'Settings', 'Help & support', 'Switch account', 'Sign out']
              okitems = all(any(n in it for it in mi['items']) for n in need) and any('Theme' in it for it in mi['items']) and any('Language' in it for it in mi['items']) and any('Upgrade' in it for it in mi['items'])
              pay = any('Payouts' in it for it in mi['items'])
              check(f'menu-items|{tag}', mi['open'] and okitems and mi['head'] == nm and mi['inView'], mi)
              check(f'menu-payouts-{"shown" if persona=="tutor" else "hidden"}|{tag}', pay == (persona == 'tutor'), pay)
              check(f'menu-plan|{tag}', mi['plan'] == ('Standard plan' if persona == 'tutor' else 'Free plan'), mi['plan'])
              await q.screenshot(path=f'{OUT}/menu-{tag}.png')
              # theme row cycles
              before = await q.evaluate("document.documentElement.dataset.theme||'light'")
              await q.click('[data-acct-theme]'); await q.wait_for_timeout(150)
              after = await q.evaluate("[localStorage.theme||'system',document.documentElement.dataset.theme||'light']")
              check(f'menu-theme-cycles|{tag}', after[0] in ('light', 'dark', 'system'), [before, after])
              await q.evaluate("localStorage.setItem('theme','%s');document.documentElement.dataset.theme='%s'==='dark'?'dark':'';if('%s'!=='dark')delete document.documentElement.dataset.theme" % (th, th, th))
              await q.keyboard.press('Escape')
          # 2) profile
          await q.goto(f'http://127.0.0.1:{PORT}/profile.html', wait_until='load'); await q.wait_for_timeout(1800)
          pf = await q.evaluate("""(()=>{const r=document.getElementById('pf');return {txt:r.innerText.slice(0,600),ph:r.querySelectorAll('.pf-ph,.pf-ph-chip').length,share:!!r.querySelector('[data-share-open]'),sarah:/sarah/i.test(document.body.innerText),ov:document.documentElement.scrollWidth-innerWidth}})()""")
          if persona == 'visitor': check(f'profile-visitor-signin|{tag}', 'Sign in' in pf['txt'] and not pf['sarah'], pf['txt'][:80])
          elif persona == 'learner_fresh': check(f'profile-fresh-placeholders|{tag}', 'AISHA NAKATO' in pf['txt'].upper() and pf['ph'] >= 4 and not pf['sarah'] and pf['ov'] <= 1, {'ph': pf['ph'], 'ov': pf['ov']})
          else: check(f'profile-tutor-data|{tag}', 'BRIAN OKELLO' in pf['txt'].upper() and 'Python' in pf['txt'] and pf['ov'] <= 1, pf['ov'])
          await q.screenshot(path=f'{OUT}/profile-{tag}.png', full_page=True)
          if persona != 'visitor':
            await q.click('[data-share-open]'); await q.wait_for_timeout(1200)
            await q.screenshot(path=f'{OUT}/share-{tag}.png')
            async with q.expect_download() as dl: await q.click('[data-dl-img]')
            d = await dl.value; pth = f'{OUT}/card-{tag}.png'; await d.save_as(pth)
            check(f'share-png|{tag}', open(pth, 'rb').read(8) == b'\x89PNG\r\n\x1a\n' and os.path.getsize(pth) > 20000, os.path.getsize(pth))
            await q.click('#pt-pdf'); await q.wait_for_timeout(100)
            async with q.expect_download() as dl: await q.click('[data-dl-pdf]')
            d = await dl.value; pth = f'{OUT}/profile-{tag}.pdf'; await d.save_as(pth); b = open(pth, 'rb').read()
            check(f'share-pdf|{tag}', b[:5] == b'%PDF-' and b.rstrip().endswith(b'%%EOF') and len(b) > 20000, len(b))
            await q.click('#pt-link'); url = await q.input_value('#pf-url')
            check(f'share-link|{tag}', url.endswith('/u/brian_ok') if persona == 'tutor' else url.endswith('/profile.html'), url)
            await q.keyboard.press('Escape')
          # 3) settings
          await q.goto(f'http://127.0.0.1:{PORT}/settings.html', wait_until='load'); await q.wait_for_timeout(2000)
          sv = await q.evaluate("""(()=>{const vis=id=>{const e=document.getElementById(id);return !!e&&!e.hidden&&e.offsetParent!==null};
            return {visitorBox:!document.querySelector('[data-st-visitor]').hidden,profile:vis('profile'),security:vis('security'),payouts:vis('payouts'),a11y:vis('accessibility'),lang:vis('language'),del:vis('delete'),
             sessions:document.querySelectorAll('#st-sessions li[data-sid]').length,notif:document.querySelectorAll('#st-notif-rows input').length,name:(document.querySelector('#st-profile [name=display_name]')||{}).value,ov:document.documentElement.scrollWidth-innerWidth}})()""")
          if persona == 'visitor': check(f'settings-visitor|{tag}', sv['visitorBox'] and not sv['profile'] and sv['a11y'] and sv['lang'] and not sv['del'], sv)
          else:
            check(f'settings-sections|{tag}', sv['profile'] and sv['security'] and sv['del'] and sv['a11y'] and sv['sessions'] == 2 and sv['notif'] == 14 and sv['ov'] <= 1, sv)
            check(f'settings-payouts-{"shown" if persona=="tutor" else "hidden"}|{tag}', sv['payouts'] == (persona == 'tutor'), sv['payouts'])
            # bg motion radio drives CC_BG
            await q.click('input[name=bgm][value=off]'); m = await q.evaluate("localStorage.cc_bg_motion"); check(f'settings-bgmotion|{tag}', m == 'off', m)
            await q.click('input[name=bgm][value=on]')
            # delete: typed confirm, server asks for reverification
            await q.fill('#st-delete [name=confirm]', 'DELETE MY ACCOUNT'); dis = await q.is_disabled('#st-delete button[type=submit]')
            await q.click('#st-delete button[type=submit]'); await q.wait_for_timeout(500)
            rv = await q.evaluate("document.getElementById('st-del-status').innerText")
            check(f'settings-delete-reverify|{tag}', (not dis) and 'Confirm it' in rv, rv[:80])
          await q.goto(f'http://127.0.0.1:{PORT}/settings.html#security', wait_until='load'); await q.wait_for_timeout(1500)
          await q.screenshot(path=f'{OUT}/settings-{tag}.png')
          check(f'no-js-errors|{tag}', not errs, errs[:3])
          await ctx.close()
    await br.close()
  json.dump(RES, open(f'{OUT}/acct_qa.json', 'w'), indent=1)
  bad = [k for k, v in RES.items() if not v['ok']]
  print('TOTAL', len(RES), 'FAIL', len(bad)); print('\n'.join(bad))
asyncio.run(run())

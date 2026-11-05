# Walk every sign-in / sign-up / onboarding path. Read-only apart from: one real sign-in of the QA Learner with the
# Clerk test code (424242 works for +clerk_test addresses on a dev instance) and one abandoned sign-up attempt that stops
# at the email-code screen (no user is created). Run under flock.
import sys, os, json, asyncio
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crawl_common as C
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else 'out/auth'
os.makedirs(OUT, exist_ok=True)
LOG = []
def log(*a):
    s = ' '.join(str(x) for x in a); print(s, flush=True); LOG.append(s)

DESCR = r"""() => { const v = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden]'); };
  return { url: location.href.replace(location.origin, ''), clerk: !!document.querySelector('.cl-rootBox,[id^=clerk-]'), customForm: !!document.querySelector('#si,#su'),
   h1: [...document.querySelectorAll('h1,h2')].filter(v).map(e => e.innerText.trim()).slice(0, 3),
   fields: [...document.querySelectorAll('input,select,textarea')].filter(v).map(e => (e.labels && e.labels[0] ? e.labels[0].innerText.trim() : '') || e.name || e.placeholder || e.type).slice(0, 20),
   buttons: [...document.querySelectorAll('button,a')].filter(v).map(e => (e.innerText || e.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 30) }; }"""

async def shot(pg, name):
    await pg.screenshot(path=f'{OUT}/{name}.png')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=C.EXE, args=['--no-sandbox', '--disable-gpu'])
        for host_name, H in ((() if os.environ.get('SKIP_PAGES') else (('public', C.PUB), ('alias', C.ALIAS)))):
            for w in (412, 1440):
                ctx = await b.new_context(viewport={'width': w, 'height': 900}, color_scheme='dark', is_mobile=w < 600, has_touch=w < 600)
                await ctx.add_init_script("try{localStorage.setItem('cookies','essential');localStorage.setItem('cc_promo_dismissed','1')}catch(e){}")
                await ctx.route('**/*', C.route)
                pg = await ctx.new_page(); pg.on('dialog', lambda d: (log('  dialog:', d.message[:120]), asyncio.ensure_future(d.dismiss())))
                for page in ('signin.html', 'signup.html', 'onboarding.html', 'verify.html'):
                    await pg.goto(f'{H}/{page}', wait_until='domcontentloaded'); await pg.wait_for_timeout(9000)
                    d = await pg.evaluate(DESCR); st = await pg.evaluate(C.STATE_JS)
                    log(f'[{host_name} {w}] {page}: clerk={d["clerk"]} customForm={d["customForm"]} grid={st["gridPts"]} canvas={st["canvas"]} h={d["h1"]} fields={d["fields"]} buttons={d["buttons"][:14]}')
                    await shot(pg, f'{host_name}-{page}-{w}')
                await ctx.close()
        if not os.environ.get('ONLY_SIGNIN'):
            pass
        # --- real sign-in of the QA Learner with the test code, then where does each auth page send a signed-in user? ---
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, color_scheme='dark')
        await ctx.add_init_script("try{localStorage.setItem('cookies','essential');localStorage.setItem('cc_promo_dismissed','1')}catch(e){}")
        await ctx.route('**/*', C.route); pg = await ctx.new_page()
        await pg.goto(f'{C.ALIAS}/signin.html', wait_until='domcontentloaded'); await pg.wait_for_timeout(9000)
        try:
            await pg.fill('input[name=identifier]', 'qa.learner.101cc+clerk_test@gmail.com', timeout=4000)
            await pg.click('.cl-formButtonPrimary', timeout=4000); await pg.wait_for_timeout(4000)
            d = await pg.evaluate(DESCR); log(f'[signin QA] after email -> {d["url"]} h={d["h1"]} fields={d["fields"]} buttons={d["buttons"][:10]}')
            await shot(pg, 'signin-qa-step2')
            if '#/factor-one' in pg.url:
                await pg.keyboard.type('424242', delay=80); await pg.wait_for_timeout(10000)
            else:
                # password-first screen: switch to "use another method" -> email code
                try:
                    await pg.get_by_text('Use another method').click(timeout=3000); await pg.wait_for_timeout(1500)
                    await pg.get_by_text('Email code', exact=False).first.click(timeout=3000); await pg.wait_for_timeout(3000)
                    await pg.locator('input[autocomplete=one-time-code], .cl-otpCodeFieldInput').first.click(); await pg.keyboard.type('424242'); await pg.wait_for_timeout(9000)
                except Exception as e: log('  alt method failed', str(e)[:120])
            st = await pg.evaluate(C.STATE_JS)
            log(f'[signin QA] landed {pg.url.replace(C.ALIAS, "")} signedIn={st["signedIn"]} names={st["names"]} acctRole={st["acctRole"]} money={st["money"]} fake={st["fakeNames"]}')
            await shot(pg, 'signin-qa-landed')
            for page in ('signin.html', 'signup.html', 'onboarding.html', 'tutor.html', 'admin.html'):
                await pg.goto(f'{C.ALIAS}/{page}', wait_until='domcontentloaded'); await pg.wait_for_timeout(7000)
                st = await pg.evaluate(C.STATE_JS)
                log(f'[signed-in QA] /{page} -> {pg.url.replace(C.ALIAS, "")} names={st["names"]} money={st["money"][:3]} fake={st["fakeNames"][:4]} demo={st["demo"]}')
                await shot(pg, f'signedin-{page}')
            # account menu contents
            await pg.goto(f'{C.ALIAS}/dashboard.html', wait_until='domcontentloaded'); await pg.wait_for_timeout(7000)
            try:
                await pg.click('.acct-btn', timeout=3000); await pg.wait_for_timeout(600)
                items = await pg.evaluate("[...document.querySelectorAll('#acct-menu [role=menuitem], #acct-menu .am-head')].filter(e => e.offsetParent).map(e => e.innerText.trim())")
                log('[signed-in QA] account menu:', items); await shot(pg, 'signedin-account-menu')
            except Exception as e: log('  menu failed', str(e)[:100])
        except Exception as e:
            log('[signin QA] failed:', str(e)[:200]); await shot(pg, 'signin-qa-failed')
        await ctx.close(); await b.close()
    open(f'{OUT}/authwalk.log', 'w').write('\n'.join(LOG))

asyncio.run(main())

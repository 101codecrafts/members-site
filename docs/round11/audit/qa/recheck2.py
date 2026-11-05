# Targeted re-checks of crawler flags (dead buttons, href-less anchors, fake certificate). Run under flock.
# For each target: own click listeners (CDP DOMDebugger), click listeners on ancestors, ambient DOM-mutation baseline
# over 800 ms vs mutations in 800 ms after the click, URL change, dialogs, before/after screenshots.
import sys, os, json, asyncio
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import crawl_common as C
from playwright.async_api import async_playwright
OUT = 'out/recheck2'; os.makedirs(OUT, exist_ok=True)
T = [
    ('PUB', 'dashboard.html', 1440, 'Hide pinned announcement', 'button[aria-label="Hide pinned announcement"]'),
    ('PUB', 'ide.html', 1440, 'Run', 'button:has-text("Run")'),
    ('PUB', 'problem.html', 1440, 'Get a hint', 'button:has-text("Get a hint")'),
    ('PUB', 'problem.html', 1440, 'Debug with 101 AI', 'button:has-text("Debug with 101 AI")'),
    ('PUB', 'tutor.html', 1440, 'Open Cal.com', 'a:has-text("Open Cal.com")'),
    ('PUB', 'marketplace.html', 1440, 'Add to cart (visitor)', 'button:has-text("Add to cart")'),
    ('PUB', 'marketplace.html', 1440, 'Search (empty)', 'button:has-text("Search")'),
    ('PUB', 'article.html', 1440, 'Post comment', 'button:has-text("Post comment")'),
    ('PUB', 'cards.html', 1440, 'Register solo', 'button:has-text("Register solo")'),
    ('PUB', 'dashboard.html', 1440, 'Create Project', 'a.qa:has-text("Create Project")'),
    ('PUB', 'onboarding.html', 412, 'Next with cookie banner (fresh visitor)', '#ob-next'),
]

async def main():
    res = []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=C.EXE, args=['--no-sandbox', '--disable-gpu'])
        for host, page, w, name, sel in T:
            fresh = 'cookie banner' in name
            ctx = await b.new_context(viewport={'width': w, 'height': 900}, color_scheme='dark', is_mobile=w < 600, has_touch=w < 600)
            if not fresh: await ctx.add_init_script("try{localStorage.setItem('cookies','essential');localStorage.setItem('cc_promo_dismissed','1')}catch(e){}")
            await ctx.route('**/*', C.route)
            pg = await ctx.new_page(); dl = []
            pg.on('dialog', lambda d: (dl.append(d.message[:140]), asyncio.ensure_future(d.dismiss())))
            H = C.PUB if host == 'PUB' else C.ALIAS
            r = {'page': page, 'width': w, 'name': name}
            try:
                await pg.goto(f'{H}/{page}', wait_until='domcontentloaded'); await pg.wait_for_timeout(5000)
                loc = pg.locator(sel).first
                r['count'] = await pg.locator(sel).count()
                if not r['count']: r['result'] = 'not found'; res.append(r); await ctx.close(); print(r, flush=True); continue
                await loc.scroll_into_view_if_needed(timeout=3000)
                h = await loc.element_handle()
                r['attrs'] = await h.evaluate("e => ({href: e.getAttribute('href'), tabindex: e.getAttribute('tabindex'), role: e.getAttribute('role'), cursor: getComputedStyle(e).cursor, focusable: (e.focus(), document.activeElement === e)})")
                cdp = await ctx.new_cdp_session(pg)
                await pg.evaluate("window.__t = null")
                await h.evaluate("e => window.__t = e")
                obj = (await cdp.send('Runtime.evaluate', {'expression': 'window.__t'}))['result']['objectId']
                own = (await cdp.send('DOMDebugger.getEventListeners', {'objectId': obj, 'depth': 0}))['listeners']
                r['own_listeners'] = sorted({l['type'] for l in own})
                anc = []
                for lvl in range(1, 12):
                    o = (await cdp.send('Runtime.evaluate', {'expression': 'window.__t' + '.parentNode' * lvl}))['result']
                    if o.get('subtype') == 'null' or 'objectId' not in o: break
                    ls = (await cdp.send('DOMDebugger.getEventListeners', {'objectId': o['objectId'], 'depth': 0}))['listeners']
                    if any(l['type'] in ('click', 'pointerdown', 'pointerup', 'touchend') for l in ls): anc.append(lvl)
                d = (await cdp.send('DOMDebugger.getEventListeners', {'objectId': (await cdp.send('Runtime.evaluate', {'expression': 'document'}))['result']['objectId'], 'depth': 0}))['listeners']
                r['ancestor_click_levels'] = anc; r['document_click'] = any(l['type'] == 'click' for l in d)
                js = "() => new Promise(res => { let n = 0; const mo = new MutationObserver(l => n += l.length); mo.observe(document.body, {subtree: true, childList: true, attributes: true, characterData: true}); setTimeout(() => { mo.disconnect(); res(n); }, 800); })"
                r['ambient'] = await pg.evaluate(js)
                await pg.screenshot(path=f'{OUT}/{page}-{name[:20].replace(" ", "_").replace("/", "")}-before.png')
                u0 = pg.url
                await pg.evaluate("() => { window.__n = 0; window.__mo2 = new MutationObserver(l => window.__n += l.length); window.__mo2.observe(document.body, {subtree: true, childList: true, attributes: true, characterData: true}); }")
                try:
                    await loc.click(timeout=3000)
                except Exception as e:
                    r['click_error'] = str(e).split('\n')[0][:160]
                    log = str(e)
                    if 'intercepts pointer events' in log: r['intercepted_by'] = log.split('intercepts pointer events')[0].rsplit('\n', 1)[-1].strip()[:160]
                await pg.wait_for_timeout(800)
                try: r['after'] = await pg.evaluate('window.__n')
                except Exception: r['after'] = None
                r['url_after'] = pg.url.replace(H, ''); r['url_changed'] = pg.url != u0; r['dialogs'] = dl[:]
                await pg.screenshot(path=f'{OUT}/{page}-{name[:20].replace(" ", "_").replace("/", "")}-after.png')
                eff = (r['after'] or 0) - r['ambient']
                r['verdict'] = ('navigates' if r['url_changed'] else 'dialog' if dl else ('DEAD (no listener, no href)' if not r['own_listeners'] and not r['ancestor_click_levels'] and not (r['attrs'].get('href')) else
                               'NO VISIBLE EFFECT' if eff <= 3 else f'changes UI (+{eff} mutations over ambient)'))
            except Exception as e:
                r['error'] = str(e)[:200]
            res.append(r); print(json.dumps(r), flush=True)
            await ctx.close()
        # fake certificate on the public static host + the alias
        ctx = await b.new_context(viewport={'width': 1440, 'height': 900}, color_scheme='dark'); await ctx.route('**/*', C.route); pg = await ctx.new_page()
        for H in (C.PUB, C.ALIAS):
            await pg.goto(f'{H}/verify.html?code=101-SE24-7Q3K', wait_until='domcontentloaded'); await pg.wait_for_timeout(6000)
            t = await pg.evaluate("(document.querySelector('#vr')||{}).innerText||''")
            res.append({'page': 'verify.html?code=101-SE24-7Q3K', 'host': H, 'result': t[:200]}); print('verify', H, t[:200], flush=True)
            await pg.screenshot(path=f'{OUT}/verify-fake-cert-{"pub" if H == C.PUB else "alias"}.png')
        await ctx.close(); await b.close()
    json.dump(res, open(f'{OUT}/recheck.json', 'w'), indent=1)

asyncio.run(main())

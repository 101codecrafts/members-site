# Round-11 audit crawler. READ-ONLY: loads pages, lists every interactive element, clicks non-navigating ones
# and records the effect. Usage: python3 crawl.py <role> <width> <page,page,...> <outdir>
#   role = visitor (public static domain, no session) | visitor-alias (protected alias, no session)
#        | learner (protected alias, signed in as the QA Learner via a Clerk sign-in ticket)
# Always run under: flock work/round11/chromium.lock
import sys, os, json, asyncio, ssl, urllib.request, urllib.error
from urllib.parse import urlparse
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
EXE = '/workspace/tools/hermes-home/tools/chromium-1208/chrome-linux/chrome'
PUB = 'https://members-site-staging.vercel.app'
ALIAS = 'https://members-site-101cc-staging.vercel.app'
B = json.load(open(os.path.join(HERE, '../../../staging/.bypass.json')))['api']
role, width, pages, outdir = sys.argv[1], int(sys.argv[2]), sys.argv[3].split(','), sys.argv[4]
os.makedirs(outdir, exist_ok=True)
H = PUB if role == 'visitor' else ALIAS
THEME = os.environ.get('THEME', 'dark')
_ctx = ssl.create_default_context(cafile=os.environ.get('SSL_CERT_FILE'))

def _fetch(url, method, headers, body):
    h = {k: v for k, v in headers.items() if k.lower() not in ('host', 'content-length', 'accept-encoding') and not k.startswith(':')}
    if urlparse(url).netloc == urlparse(ALIAS).netloc: h['x-vercel-protection-bypass'] = B
    r = urllib.request.Request(url, data=body, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, context=_ctx, timeout=25) as x: return x.status, list(x.headers.items()), x.read()
    except urllib.error.HTTPError as e: return e.code, list(e.headers.items()), e.read()

async def _route(route):
    rq = route.request
    if any(d in rq.url for d in ('googlesyndication', 'doubleclick', 'google-analytics', 'chatwoot', 'adtrafficquality', 'fundingchoices')): return await route.abort()
    if not rq.url.startswith('http'): return await route.continue_()
    try:
        st, hd, body = await asyncio.to_thread(_fetch, rq.url, rq.method, await rq.all_headers(), rq.post_data_buffer)
        hd = [(k, v) for k, v in hd if k.lower() not in ('content-encoding', 'transfer-encoding', 'content-length', 'connection')]
        await route.fulfill(status=st, headers=dict(hd), body=body)
    except Exception:
        await route.abort()

LIST_JS = r"""() => {
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !e.closest('[hidden],[inert]'); };
  const zone = e => e.closest('#sbar,.sbar,.side') ? 'sidebar' : e.closest('.topbar,header,.nav,.tb') ? 'top' : e.closest('#acct-menu,.acct') ? 'account' : e.closest('footer') ? 'footer' : e.closest('dialog,[role=dialog]') ? 'dialog' : 'main';
  const sel = 'a,button,[role=button],[role=menuitem],[role=tab],[onclick],input[type=submit],input[type=button],summary,select,label.opt,[data-href]';
  const out = []; let i = 0;
  document.querySelectorAll(sel).forEach(e => { i++; e.dataset.auditIdx = i;
    const t = (e.getAttribute('aria-label') || e.innerText || e.value || e.title || '').replace(/\s+/g, ' ').trim().slice(0, 70);
    out.push({ idx: i, tag: e.tagName.toLowerCase(), text: t, href: e.tagName === 'A' ? (e.getAttribute('href') || '') : (e.dataset.href || ''), abs: e.href || '', target: e.target || '',
      vis: vis(e), zone: zone(e), disabled: !!e.disabled, id: e.id || '', cls: (e.className && e.className.baseVal === undefined ? e.className : '').toString().slice(0, 60),
      cursor: getComputedStyle(e).cursor }); });
  return out; }"""

STATE_JS = r"""() => {
  const d = document.documentElement, sb = document.querySelector('#sbar');
  const vis = e => { if (!e) return false; const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  // background: where is the page colour coming from at 7 empty-ish points? grid is on body::before, so a point "shows grid"
  // when the first opaque element under it is html/body.
  const opaque = e => { const cs = getComputedStyle(e), c = cs.backgroundColor; return cs.backgroundImage !== 'none' || (c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c)); };
  const pts = [[.03,.5],[.97,.5],[.5,.97],[.03,.97],[.97,.12],[.5,.6],[.25,.85]]; let grid = 0; const cover = [];
  for (const [fx, fy] of pts) { const els = document.elementsFromPoint(innerWidth * fx, innerHeight * fy); const o = els.find(e => opaque(e) && e.tagName !== 'CANVAS');
    if (!o || o === document.body || o === d) grid++; else cover.push((o.tagName + '.' + (o.className && o.className.toString ? o.className.toString() : '')).slice(0, 40)); }
  const before = getComputedStyle(document.body, '::before').backgroundImage;
  const canvas = [...document.querySelectorAll('canvas')].some(c => { const r = c.getBoundingClientRect(); return getComputedStyle(c).position === 'fixed' && r.width >= innerWidth * .9; });
  const nameEls = [...document.querySelectorAll('.acct-name,.chip-me b,.me-name')].filter(vis).map(e => e.textContent.trim());
  const acctRole = [...document.querySelectorAll('.acct-role')].map(e => e.textContent.trim());
  const money = (document.body.innerText.match(/UGX\s?[\d,]{5,}/g) || []).slice(0, 6);
  const fakeNames = ['Sarah Namubiru','Kato','Brian','Amina','Joseph','Grace','Opio','Nakato','Mukasa','Kizza','Achieng'].filter(n => document.body.innerText.includes(n));
  return { url: location.href, title: document.title, page: document.body.dataset.page || '', theme: d.dataset.theme || 'light', signedIn: d.classList.contains('signed-in'),
    sidebar: !!sb, sidebarVisible: vis(sb), hamburger: vis(document.querySelector('[data-sb-open]')), demo: !!window.CC_DEMO,
    demoBanner: vis(document.querySelector('.demo-banner,#cc-demo,[data-demo-banner]')),
    bgBefore: before && before !== 'none', gridPts: grid + '/' + pts.length, cover, canvas, names: nameEls, acctRole, money, fakeNames,
    quick: [...document.querySelectorAll('a,button')].filter(vis).map(e => (e.innerText || '').trim()).filter(t => /^(\+\s*)?(create|new|add|sell|post|upload|start a|list an?)\b/i.test(t)).slice(0, 15),
    scrollW: d.scrollWidth, vw: innerWidth };
}"""

ARM_JS = r"""() => { window.__m = 0; window.__mo && window.__mo.disconnect(); window.__mo = new MutationObserver(l => window.__m += l.length);
  window.__mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); window.__mark = 1; }"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE, args=['--no-sandbox', '--disable-gpu'])
        ctx = await b.new_context(viewport={'width': width, 'height': 900}, color_scheme=THEME, device_scale_factor=1,
                                  is_mobile=width < 600, has_touch=width < 600)
        await ctx.add_init_script("try{localStorage.setItem('cookies','essential');localStorage.setItem('cc_promo_dismissed','1');sessionStorage.setItem('cc_demo_seen','1')}catch(e){}")
        await ctx.route('**/*', _route)
        pg = await ctx.new_page()
        dialogs = []
        pg.on('dialog', lambda d: (dialogs.append(d.message[:160]), asyncio.ensure_future(d.dismiss())))
        if role == 'learner':
            from clerkqa import UID
            import requests
            tok = requests.post('https://api.clerk.com/v1/sign_in_tokens', json={'user_id': UID, 'expires_in_seconds': 900}).json()['token']
            await pg.goto(f'{H}/signin.html?__clerk_ticket={tok}', wait_until='domcontentloaded'); await pg.wait_for_timeout(9000)
            who = await pg.evaluate("(window.Clerk&&Clerk.user&&Clerk.user.fullName)||null")
            print('signed in as', who, 'landed', pg.url.split('?')[0], flush=True)
        for name in pages:
            res = {'page': name, 'role': role, 'width': width}
            api = []
            hnd = lambda r, a=api: a.append(f"{r.status} {r.request.method} {urlparse(r.url).path}") if '/api/' in r.url else None
            pg.on('response', hnd)
            try:
                resp = await pg.goto(f'{H}/{name}', wait_until='domcontentloaded', timeout=30000)
                res['status'] = resp.status if resp else None
                await pg.wait_for_timeout(4500)
                res['state'] = await pg.evaluate(STATE_JS)
                await pg.screenshot(path=f'{outdir}/{name.replace("/", "_").replace("?", "_")}-{role}-{width}.png')
                els = await pg.evaluate(LIST_JS)
                start = pg.url
                for e in els:
                    if not e['vis'] or e['disabled']: continue
                    h = e['href']
                    navigating = e['tag'] == 'a' and h and not h.startswith('#') and not h.lower().startswith('javascript')
                    if navigating or e['tag'] == 'select': continue
                    if e['tag'] == 'a' and h.startswith('#') and len(h) > 1:
                        ok = await pg.evaluate("h => { try { return !!document.querySelector(h) || !!document.getElementById(h.slice(1)); } catch (e) { return false; } }", h)
                        if ok or h.startswith('#/'): e['effect'] = 'anchor'; continue
                    if sum(1 for x in els if x.get('effect')) >= 30: e['effect'] = 'skipped(cap)'; continue
                    try:
                        if pg.url != start:
                            await pg.goto(start, wait_until='domcontentloaded'); await pg.wait_for_timeout(2500); await pg.evaluate(LIST_JS)
                        await pg.evaluate(ARM_JS); dialogs.clear(); u0 = pg.url
                        loc = pg.locator(f'[data-audit-idx="{e["idx"]}"]')
                        if await loc.count() == 0 or not await loc.first.is_visible(): e['effect'] = 'gone'; continue
                        async with ctx.expect_page(timeout=600) as pi:
                            await loc.first.click(timeout=2500)
                        e['effect'] = 'popup:' + (await pi.value).url[:90]; await (await pi.value).close()
                    except Exception as ex:
                        if 'effect' not in e:
                            await pg.wait_for_timeout(500)
                            try:
                                m, mk = await pg.evaluate('[window.__m, window.__mark]')
                            except Exception:
                                m, mk = None, None
                            if dialogs: e['effect'] = 'dialog:' + dialogs[-1]
                            elif pg.url != u0: e['effect'] = 'nav:' + pg.url.replace(H, '')[:90]
                            elif mk is None: e['effect'] = 'reload'
                            elif 'Timeout' in str(ex) and 'click' in str(ex).lower() and m is None: e['effect'] = 'click-failed'
                            elif m: e['effect'] = f'dom:{m}'
                            else: e['effect'] = 'NO-OP'
                    try:
                        await pg.keyboard.press('Escape')
                    except Exception: pass
                res['elements'] = els
            except Exception as ex:
                res['error'] = str(ex)[:300]
            pg.remove_listener('response', hnd)
            res['api'] = api[:40]
            json.dump(res, open(f'{outdir}/{name.replace("/", "_").replace("?", "_")}-{role}-{width}.json', 'w'), indent=1)
            st = res.get('state', {})
            print(name, width, role, res.get('status'), 'sb', st.get('sidebarVisible'), 'grid', st.get('gridPts'), 'canvas', st.get('canvas'), 'names', st.get('names'), 'noop', sum(1 for e in res.get('elements', []) if e.get('effect') == 'NO-OP'), flush=True)
        await b.close()

asyncio.run(main())

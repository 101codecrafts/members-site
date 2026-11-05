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
    try:
        if any(d in rq.url for d in ('googlesyndication', 'doubleclick', 'google-analytics', 'chatwoot', 'adtrafficquality', 'fundingchoices')): return await route.abort()
    except Exception:
        return
    if not rq.url.startswith('http'): return await route.continue_()
    try:
        st, hd, body = await asyncio.to_thread(_fetch, rq.url, rq.method, await rq.all_headers(), rq.post_data_buffer)
        hd = [(k, v) for k, v in hd if k.lower() not in ('content-encoding', 'transfer-encoding', 'content-length', 'connection')]
        await route.fulfill(status=st, headers=dict(hd), body=body)
    except Exception:
        try: await route.abort()
        except Exception: pass

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

route = _route

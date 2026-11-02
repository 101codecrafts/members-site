"""Screenshot a page with headless Chromium.
usage: shot.py page.html[?query] out.png W H [full]
Network is blocked (the sandbox browser is offline); jsDelivr libraries are served from tools/.cache so
charts/animation code still runs. Everything else external is aborted, so pages show their fallbacks."""
import sys, asyncio, os, pathlib
from playwright.async_api import async_playwright
CACHE = pathlib.Path(__file__).resolve().parent / '.cache'

async def route(r):
    u = r.request.url
    if u.startswith('file:'): return await r.continue_()
    if 'cdn.jsdelivr.net/npm/' in u:
        f = CACHE / u.split('/npm/')[1].replace('/', '_').replace('@', '_')
        if f.exists(): return await r.fulfill(path=str(f), content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'})
    await r.abort()

async def main(page, out, w, h, full=False):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--font-render-hinting=none'])
        pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
        await pg.route('**/*', route)
        path, _, q = page.partition('?')
        await pg.goto('file://' + os.path.abspath(path) + ('?' + q if q else ''))
        await pg.evaluate('document.fonts.ready')
        if full and 'static' not in q:   # scroll through so scroll-triggered entrances finish
            hgt = await pg.evaluate('document.documentElement.scrollHeight')
            for y in range(0, hgt, 500): await pg.evaluate(f'window.scrollTo(0,{y})'); await pg.wait_for_timeout(120)
            await pg.evaluate('window.scrollTo(0,0)')
        await pg.wait_for_timeout(1200 if 'static' not in q else 300)
        await pg.screenshot(path=out, full_page=full)
        await b.close()

a = sys.argv
asyncio.run(main(a[1], a[2], int(a[3]), int(a[4]), len(a) > 5 and a[5] == 'full'))

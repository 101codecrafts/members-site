"""Loads every page (live mode, network blocked except cached CDN libs) and reports JS errors + screenshots.
usage: check.py W H outdir [pages...]"""
import sys, asyncio, os, pathlib, glob
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(__file__))
CACHE = pathlib.Path(__file__).resolve().parent / '.cache'
async def route(r):
    u = r.request.url
    if u.startswith('file:'): return await r.continue_()
    if 'cdn.jsdelivr.net/npm/' in u:
        f = CACHE / u.split('/npm/')[1].replace('/', '_').replace('@', '_')
        if f.exists(): return await r.fulfill(path=str(f), content_type='application/javascript', headers={'Access-Control-Allow-Origin': '*'})
    await r.abort()
async def main():
    W, H, out = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]; os.makedirs(out, exist_ok=True)
    pages = sys.argv[4:] or sorted(p for p in glob.glob('*.html'))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        for pg_name in pages:
            ctx = await b.new_context(viewport={'width': W, 'height': H}, is_mobile=W < 500, has_touch=W < 500)
            pg = await ctx.new_page(); await pg.route('**/*', route); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            name, _, q = pg_name.partition('?')
            await pg.goto('file://' + os.path.abspath(name) + ('?' + q if q else ''))
            await pg.wait_for_timeout(1500)
            sw = await pg.evaluate('document.documentElement.scrollWidth')
            await pg.screenshot(path=f'{out}/{name[:-5]}.png')
            print(f'{pg_name:28s} errors={len(errs)} scrollWidth={sw}', '; '.join(errs)[:300])
            await ctx.close()
        await b.close()
asyncio.run(main())

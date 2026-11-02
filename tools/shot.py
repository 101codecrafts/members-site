import sys, asyncio
from playwright.async_api import async_playwright
# usage: shot.py page.html out.png W H
async def main(page, out, w, h):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox','--font-render-hinting=none'])
        pg = await b.new_page(viewport={'width':w,'height':h}, device_scale_factor=1)
        await pg.route(lambda u: not u.startswith('file:'), lambda r: r.abort())  # offline: mockup comparison never depends on the network
        import os
        await pg.goto('file://'+os.path.abspath(page.split('?')[0])+('?'+page.split('?')[1] if '?' in page else ''))
        await pg.evaluate('document.fonts.ready')
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=out, full_page=False)
        await b.close()
a=sys.argv; asyncio.run(main(a[1],a[2],int(a[3]),int(a[4])))

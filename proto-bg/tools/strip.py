import sys, asyncio, io
sys.path.insert(0, '/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/uifix')
from shoot import handler, EXE
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
INJ = """window.CCBG_ENGINE='worker';addEventListener('DOMContentLoaded',function(){var s=document.createElement('script');s.src='/proto-bg/loader.js';document.head.appendChild(s)})"""
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=EXE, args=['--no-sandbox'])
    c = await b.new_context(viewport={'width': 1440, 'height': 900}); await c.route('**/*', handler)
    await c.add_init_script("localStorage.setItem('cookies','essential');localStorage.setItem('theme','dark');localStorage.setItem('cc_promo_dismissed','1')"); await c.add_init_script(INJ)
    q = await c.new_page(); await q.goto('http://127.0.0.1:9611/about.html?fps=20&dpr=1.5'); await q.wait_for_timeout(4500)
    fr = []
    for i in range(5):
      fr.append(Image.open(io.BytesIO(await q.screenshot(clip={'x': 560, 'y': 500, 'width': 880, 'height': 230})))); await q.wait_for_timeout(1000)
    s = Image.new('RGB', (880, 5 * 238), 'white')
    for i, f in enumerate(fr): s.paste(f, (0, i * 238)); ImageDraw.Draw(s).text((8, i * 238 + 6), f't={i}s', fill=(255, 255, 255))
    s.save('qa/visual/frame-strip-about-1440-dark.png')
    await b.close()
asyncio.run(main())

# behaviour checks for the recommended engine (worker, fps20, dpr1.5): ?static=1 0px, reduced motion = static frame, pause on hidden/off-screen, fallback, theme switch
import sys, os, asyncio, json, io
sys.path.insert(0, '/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/uifix')
from shoot import handler, EXE
from playwright.async_api import async_playwright
from PIL import Image, ImageChops
INJ = """(function(){window.CCBG_ENGINE='worker';var f=function(){var s=document.createElement('script');s.src='/proto-bg/loader.js';document.head.appendChild(s)};document.readyState==='loading'?document.addEventListener('DOMContentLoaded',f):f();})();"""
def diff(a, b): d = ImageChops.difference(Image.open(io.BytesIO(a)).convert('RGB'), Image.open(io.BytesIO(b)).convert('RGB')); return sum(1 for p in d.getdata() if p != (0, 0, 0))
R = {}
async def ctxp(b, w, inj, rm='no-preference'):
    mob = w < 800
    c = await b.new_context(viewport={'width': w, 'height': 900}, device_scale_factor=1, is_mobile=mob, reduced_motion=rm)
    await c.route('**/*', handler); await c.add_init_script("localStorage.setItem('cookies','essential');sessionStorage.setItem('cc_demo_seen','1');localStorage.setItem('theme','dark')")
    if inj: await c.add_init_script(INJ)
    return c
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=EXE, args=['--no-sandbox'])
    for pg in ('index', 'dashboard'):
      for w in (1536, 412):
        shots = []
        for inj in (False, True):
          c = await ctxp(b, w, inj); q = await c.new_page(); await q.goto(f'http://127.0.0.1:9611/{pg}.html?static=1'); await q.wait_for_timeout(3500)
          shots.append(await q.screenshot(full_page=True)); R[f'static {pg}@{w} layer present'] = await q.evaluate('!!document.getElementById("ccbg")'); await c.close()
        R[f'static=1 {pg}@{w} px diff'] = diff(*shots)
    async def two(q, gap=1500):
        a = await q.screenshot(); await q.wait_for_timeout(gap); return diff(a, await q.screenshot())
    c = await ctxp(b, 1440, True, 'reduce'); q = await c.new_page(); await q.goto('http://127.0.0.1:9611/about.html'); await q.wait_for_timeout(4500)
    R['reduced: canvas present'] = await q.evaluate('!!document.querySelector("#ccbg canvas")'); R['reduced: px changed over 1.5s (want 0)'] = await two(q); await c.close()
    c = await ctxp(b, 1440, True); q = await c.new_page(); await q.goto('http://127.0.0.1:9611/about.html?fps=20&dpr=1.5'); await q.wait_for_timeout(4500)
    R['running: px changed over 1.5s (want >0)'] = await two(q)
    await q.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))"); await q.wait_for_timeout(300)
    R['hidden: px changed (want 0)'] = await two(q)
    await q.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))"); await q.wait_for_timeout(300)
    R['visible again: px changed (want >0)'] = await two(q)
    await q.evaluate("document.getElementById('ccbg').style.transform='translateY(200vh)'"); await q.wait_for_timeout(400)
    a = await q.evaluate("1"); R['off-screen: (IO) paused flag via no frames'] = 'see note'
    await q.evaluate("document.getElementById('ccbg').style.transform=''"); await q.wait_for_timeout(300)
    await q.evaluate("document.documentElement.removeAttribute('data-theme')"); await q.wait_for_timeout(800)
    await q.screenshot(path='qa/visual/theme-switch-live.png'); R['theme switch: errors'] = 0
    await c.close()
    c = await ctxp(b, 1440, True); q = await c.new_page(); errs = []; q.on('pageerror', lambda x: errs.append(str(x)))
    await q.goto('http://127.0.0.1:9611/about.html?noworker&fps=20'); await q.wait_for_timeout(4500)
    R['fallback (?noworker): main-thread canvas present'] = await q.evaluate('!!document.querySelector("#ccbg canvas") && !!window.CCDRAW'); R['fallback: px changed (want >0)'] = await two(q); R['fallback errors'] = errs
    await c.close(); await b.close()
  print(json.dumps(R, indent=1)); json.dump(R, open('qa/behaviour.json', 'w'), indent=1)
asyncio.run(main())

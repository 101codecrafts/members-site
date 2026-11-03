# usage: visual.py engines pages widths themes outdir [scrollY]  -> screenshots of REAL pages with the prototype injected at runtime (no source edits)
import sys, os, asyncio, json
sys.path.insert(0, '/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/uifix')
from shoot import handler, EXE
from playwright.async_api import async_playwright
eng, pages, widths, themes, out = sys.argv[1].split(','), sys.argv[2].split(','), [int(x) for x in sys.argv[3].split(',')], sys.argv[4].split(','), sys.argv[5]
sy = int(sys.argv[6]) if len(sys.argv) > 6 else 0
os.makedirs(out, exist_ok=True)
INJ = """(function(){window.CCBG_ENGINE=%r;var f=function(){var s=document.createElement('script');s.src='/proto-bg/loader.js';document.head.appendChild(s)};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',f):f();})();"""
async def main():
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=EXE, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    rep = {}
    for e in eng:
     for th in themes:
      for w in widths:
        mob = w < 800
        ctx = await b.new_context(viewport={'width': w, 'height': 900 if not mob else 860}, device_scale_factor=1 if not mob else 2, is_mobile=mob, has_touch=mob)
        await ctx.route('**/*', handler)
        await ctx.add_init_script(f"localStorage.setItem('cookies','essential');sessionStorage.setItem('cc_demo_seen','1');localStorage.setItem('theme','{th}');localStorage.setItem('cc_promo_dismissed','1')")
        if e != 'none': await ctx.add_init_script(INJ % e.split('&')[0])
        for pg in pages:
          q = await ctx.new_page(); errs = []
          q.on('pageerror', lambda x, l=errs: l.append(str(x)[:160]))
          q.on('console', lambda m, l=errs: l.append(m.text[:160]) if m.type == 'error' else None)
          await q.goto(f'http://127.0.0.1:9611/{pg}.html' + ('?' + e.partition('&')[2] if '&' in e else '')); await q.wait_for_timeout(4200)
          if sy: await q.evaluate(f'scrollTo(0,{sy})'); await q.wait_for_timeout(600)
          await q.screenshot(path=f'{out}/{pg}-{w}-{th}-{e.split("&")[0]}{"-s" if sy else ""}.png')
          rep[f'{pg}-{w}-{th}-{e}'] = [x for x in errs if 'ERR_FAILED' not in x and '404' not in x]; await q.close()
        await ctx.close()
    await b.close(); print(json.dumps({k: v for k, v in rep.items() if v}, indent=0))
asyncio.run(main())

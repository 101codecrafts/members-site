"""Background presence probe (round 11). For each page x width x theme: is body::before painting the grid, is it covered by an
opaque full-viewport layer, and (dark) is the #ccbg canvas live? Also measures the grid visually: hide every element except
#ccbg, screenshot, and count grid-line energy (stddev) in a page-margin strip.
usage: python3 bgprobe.py PORT OUTDIR pages(comma) [widths=412,1440] [themes=light,dark]"""
import sys, json, asyncio, os
sys.path.insert(0, '/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/uifix')
from shoot import handler, EXE
from playwright.async_api import async_playwright
from PIL import Image, ImageStat

PORT = int(sys.argv[1]); OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
PAGES = sys.argv[3].split(',')
WIDTHS = [int(x) for x in (sys.argv[4] if len(sys.argv) > 4 else '412,1440').split(',')]
THEMES = (sys.argv[5] if len(sys.argv) > 5 else 'light,dark').split(',')
PROBE = """(()=>{const b=document.body,cs=getComputedStyle(b,'::before');
 const cv=document.getElementById('ccbg');
 /* is something opaque and viewport-sized painting over the layer? sample 5 points through elementsFromPoint */
 const pts=[[.025,.5],[.975,.5],[.025,.2],[.975,.85]],cover=[];
 for(const [x,y] of pts){const els=document.elementsFromPoint(innerWidth*x,innerHeight*y);
   for(const e of els){if(e===b||e===document.documentElement||e.id==='ccbg')break;const c=getComputedStyle(e);
     const r=e.getBoundingClientRect();const op=(c.backgroundColor&&!/rgba\\([^)]*,\\s*0\\)$|transparent/.test(c.backgroundColor))||c.backgroundImage!=='none';
     if(op&&r.width>=innerWidth*.9&&r.height>=innerHeight*.6){cover.push((e.tagName+'.'+e.className).slice(0,60));break}}}
 return {before:cs.content!=='none'&&cs.backgroundImage!=='none',pos:cs.position,z:cs.zIndex,bodyZ:getComputedStyle(b).zIndex,
   canvas:!!cv,canvasShown:cv?getComputedStyle(cv).display!=='none':false,bg:window.CC_BG?CC_BG.info().live:null,cover:[...new Set(cover)],
   page:b.dataset.page||''}})()"""
HIDE = """(()=>{const s=document.createElement('style');s.textContent='body *:not(#ccbg){visibility:hidden!important}';document.head.appendChild(s)})()"""

async def run():
  res = {}
  async with async_playwright() as p:
    br = await p.chromium.launch(executable_path=EXE, args=['--no-sandbox'])
    for w in WIDTHS:
      mob = w < 800
      for th in THEMES:
        ctx = await br.new_context(viewport={'width': w, 'height': 860 if mob else 900}, device_scale_factor=2 if mob else 1, is_mobile=mob, has_touch=mob)
        await ctx.route('**/*', handler)
        await ctx.add_init_script("localStorage.setItem('cookies','essential');sessionStorage.setItem('cc_demo_seen','1');localStorage.setItem('theme','%s');" % th)
        for pg in PAGES:
          q = await ctx.new_page(); key = f'{pg}|{w}|{th}'
          try:
            await q.goto(f'http://127.0.0.1:{PORT}/{pg}', wait_until='load', timeout=20000)
            await q.wait_for_timeout(2600)
            r = await q.evaluate(PROBE)
            await q.screenshot(path=f'{OUT}/{pg.replace("/", "_").replace("?", "_")}-{w}-{th}.png')
            await q.evaluate(HIDE); await q.wait_for_timeout(200)
            f = f'{OUT}/bare-{pg.replace("/", "_").replace("?", "_")}-{w}-{th}.png'; await q.screenshot(path=f)
            im = Image.open(f).convert('L'); W, H = im.size
            st = ImageStat.Stat(im.crop((int(W * .02), int(H * .15), int(W * .3), int(H * .85))))
            r['stdev'] = round(st.stddev[0], 2)
            # grid shows when line energy exists; dark canvas adds more. light needs >0.6, dark >0.6 (+canvas live)
            r['ok'] = bool(r['before'] and not r['cover'] and r['stdev'] > 0.6 and (th == 'light' or r['bg'] is True or r.get('expectNoCanvas')))
          except Exception as e:
            r = {'err': str(e)[:160], 'ok': False}
          res[key] = r; print(key, 'OK' if r.get('ok') else 'MISSING', json.dumps(r), flush=True)
          await q.close()
        await ctx.close()
    await br.close()
  json.dump(res, open(f'{OUT}/bgprobe.json', 'w'), indent=1)
  bad = [k for k, v in res.items() if not v.get('ok')]
  print('TOTAL', len(res), 'MISSING', len(bad)); print('\n'.join(bad))
asyncio.run(run())

"""Left-band check (round 10). For each page x config x theme: hide everything inside .shell's content (visibility,
so layout stays) and the topbar/sidebar, then compare the left strip (x 16..236) with the right strip of the same
screenshot. A dead band = left strip flat (no grid lines) while the right strip has grid lines, or the two strips'
mean colours differ. Also records the computed background-image of .shell/.main/body.
usage: python3 band.py PORT OUTDIR [pages] [label]"""
import sys, json, asyncio, os
sys.path.insert(0, '/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/uifix')
from shoot import handler, EXE
from playwright.async_api import async_playwright
from PIL import Image, ImageStat

PORT = int(sys.argv[1]); OUT = sys.argv[2]; os.makedirs(OUT, exist_ok=True)
PAGES = (sys.argv[3] if len(sys.argv) > 3 else 'announcements,launchpad,index,dashboard,courses,practice,marketplace,ai-tools,community,about,news').split(',')
ANDROID_DESKTOP_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
MOB_UA = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36'
# name, viewport w, h, dpr, mobile, touch, ua, sidebar state
CONFIGS = [
  ('980desk', 980, 2000, 1.1, True, True, ANDROID_DESKTOP_UA, None),  # Android Chrome "Desktop site": ~980 layout, touch
  ('360', 360, 780, 2, True, True, MOB_UA, None),
  ('412', 412, 860, 2.6, True, True, MOB_UA, None),
  ('768', 768, 1000, 2, True, True, MOB_UA, None),
  ('1024', 1024, 800, 1, False, False, None, 'expanded'),
  ('1024c', 1024, 800, 1, False, False, None, 'collapsed'),
  ('1440', 1440, 900, 1, False, False, None, 'expanded'),
  ('1440c', 1440, 900, 1, False, False, None, 'collapsed'),
]
HIDE = """(()=>{const s=document.createElement('style');s.id='bandqa';
s.textContent='body *:not(.shell):not(#ccbg){visibility:hidden!important}';
document.head.appendChild(s);})()"""

def strip_stats(im, x0, x1, y0, y1):
  c = im.crop((x0, y0, x1, y1)).convert('L')
  st = ImageStat.Stat(c); return st.mean[0], st.stddev[0]

CF=os.environ.get('CF')
if CF: CONFIGS=[c for c in CONFIGS if c[0] in CF.split(',')]
async def run():
  res = {}
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=EXE, args=['--no-sandbox'])
    for name, w, h, dpr, mob, touch, ua, sb in CONFIGS:
      for theme in ('light', 'dark'):
        kw = dict(viewport={'width': w, 'height': h}, device_scale_factor=dpr, is_mobile=mob, has_touch=touch)
        if ua: kw['user_agent'] = ua
        ctx = await b.new_context(**kw); await ctx.route('**/*', handler)
        init = "localStorage.setItem('cookies','essential');sessionStorage.setItem('cc_demo_seen','1');localStorage.setItem('theme','%s');" % theme
        if sb: init += "localStorage.setItem('cc.sidebar','%s');" % sb
        await ctx.add_init_script(init)
        for pg in PAGES:
          q = await ctx.new_page()
          try:
            await q.goto(f'http://127.0.0.1:{PORT}/{pg}.html', wait_until='load', timeout=20000)
          except Exception as e:
            res[f'{pg}|{name}|{theme}'] = {'err': str(e)[:120]}; await q.close(); continue
          await q.wait_for_timeout(1200)
          vw = await q.evaluate('innerWidth')
          bgs = await q.evaluate("""(()=>{const g=s=>{const e=document.querySelector(s);return e?getComputedStyle(e).backgroundImage.slice(0,90)+' | '+getComputedStyle(e).backgroundColor:null};
            return {shell:g('.shell'),main:g('.shell>.main'),body:g('body')}})()""")
          shot = f'{OUT}/{pg}-{name}-{theme}.png'
          await q.screenshot(path=shot)
          await q.evaluate(HIDE); await q.wait_for_timeout(150)
          bare = f'{OUT}/bare-{pg}-{name}-{theme}.png'
          await q.screenshot(path=bare)
          im = Image.open(bare); sc = im.width / vw
          y0, y1 = int(80 * sc), int(min(h, 1600) * sc) - 4
          sbw = await q.evaluate("(()=>{const s=document.querySelector('.shell .sbar');if(!s)return 0;const r=s.getBoundingClientRect();return getComputedStyle(s).position==='fixed'?0:Math.max(0,r.right)})()")
          lx = sbw + 16; wid = min(220, (vw - sbw) / 2 - 20)
          L = strip_stats(im, int(lx * sc), int((lx + wid) * sc), y0, y1)
          R = strip_stats(im, int((vw - 16 - wid) * sc), int((vw - 16) * sc), y0, y1)
          band = abs(L[0] - R[0]) > 6 or (R[1] > 1.2 and L[1] < R[1] * 0.35)
          res[f'{pg}|{name}|{theme}'] = {'vw': vw, 'L': [round(L[0], 1), round(L[1], 2)], 'R': [round(R[0], 1), round(R[1], 2)], 'band': band, 'sbw': sbw, 'bg': bgs}
          print(pg, name, theme, 'BAND' if band else 'ok', L, R, flush=True)
          await q.close()
        await ctx.close()
    await b.close()
  json.dump(res, open(f'{OUT}/band.json', 'w'), indent=1)
  bad = [k for k, v in res.items() if v.get('band') or v.get('err')]
  print('TOTAL', len(res), 'BAND/ERR', len(bad)); print('\n'.join(bad))

asyncio.run(run())

# usage: trace.py engine page conf -> top main-thread + worker events by self time over 3s idle
import sys, os, asyncio, json, collections
sys.path.insert(0, '/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/uifix')
from shoot import handler, EXE
from playwright.async_api import async_playwright
ENG, pg, CONFS, outp = sys.argv[1].split(','), sys.argv[2], sys.argv[3].split(','), sys.argv[4]
CC = {'412x4cpu': dict(w=412, h=860, dpr=2, mob=True, cpu=4), '1440': dict(w=1440, h=900, dpr=1, mob=False, cpu=1)}
async def main():
  res = json.load(open(outp)) if os.path.exists(outp) else {}
  async with async_playwright() as p:
   b = await p.chromium.launch(executable_path=EXE, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
   for e in ENG:
    for conf in CONFS:
     C = CC[conf]
     ctx = await b.new_context(viewport={'width': C['w'], 'height': C['h']}, device_scale_factor=C['dpr'], is_mobile=C['mob'], has_touch=C['mob'])
     await ctx.route('**/*', handler)
     await ctx.add_init_script("localStorage.setItem('cookies','essential');localStorage.setItem('theme','dark');localStorage.setItem('cc_promo_dismissed','1')")
     q = await ctx.new_page(); cdp = await ctx.new_cdp_session(q); await cdp.send('Emulation.setCPUThrottlingRate', {'rate': C['cpu']})
     if pg != 'proto' and e != 'none': await q.add_init_script("window.CCBG_ENGINE=%r;document.addEventListener('DOMContentLoaded',function(){var s=document.createElement('script');s.src='/proto-bg/loader.js';document.head.appendChild(s)})" % e)
     await q.goto(f'http://127.0.0.1:9611/proto-bg/index.html?e={e}' if pg == 'proto' else f'http://127.0.0.1:9611/{pg}.html'); await q.wait_for_timeout(3000)
     await b.start_tracing(page=q, categories=['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc'])
     await q.wait_for_timeout(3000)
     tr = json.loads(await b.stop_tracing())
     ev = tr['traceEvents']; names = {}
     for x in ev:
       if x.get('ph') == 'M' and x.get('name') == 'thread_name': names[(x['pid'], x['tid'])] = x['args']['name']
     agg = collections.Counter()
     for x in ev:
       if x.get('ph') == 'X' and 'dur' in x:
         t = names.get((x['pid'], x['tid']), '?')
         if t in ('CrRendererMain', 'DedicatedWorker thread', 'Compositor', 'VizCompositorThread', 'CrGpuMain'): agg[(t, x['name'])] += x['dur']
     tot = {t: round(sum(d for (tt, n), d in agg.items() if tt == t and n in ('RunTask', 'ThreadControllerImpl::RunTask')) / 3000, 1) for t in ('CrRendererMain', 'DedicatedWorker thread', 'Compositor', 'VizCompositorThread', 'CrGpuMain')}
     fr = sum(1 for x in ev if x.get('name') == 'FireAnimationFrame')
     res[f'{e}|{pg}|{conf}'] = tot; print(e, conf, tot, flush=True)
     await ctx.close()
   await b.close()
  json.dump(res, open(outp, "w"), indent=1)
asyncio.run(main())

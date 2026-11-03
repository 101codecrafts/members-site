# usage: bench.py engines pages out.json  -> per (engine, page, config): main-thread cost idle, heap, layers, scroll jank, CLS, LCP
import sys, os, asyncio, json
sys.path.insert(0, '/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/uifix')
from shoot import handler, EXE
from playwright.async_api import async_playwright
eng, pages, outp = sys.argv[1].split(','), sys.argv[2].split(','), sys.argv[3]
CONF = [dict(name='412x4cpu', w=412, h=860, dpr=2, mob=True, cpu=4), dict(name='1440', w=1440, h=900, dpr=1, mob=False, cpu=1)]
if len(sys.argv) > 4: CONF = [c for c in CONF if c['name'] == sys.argv[4]]
INJ = """(function(){window.CCBG_ENGINE=%r;var f=function(){var s=document.createElement('script');s.src='/proto-bg/loader.js';document.head.appendChild(s)};
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',f):f();})();"""
OBS = """window.__cls=0;window.__lcp=0;window.__bgshift=0;try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput){__cls+=e.value;for(const s of e.sources||[])if(s.node&&s.node.closest&&s.node.closest('#ccbg'))__bgshift+=e.value}}).observe({type:'layout-shift',buffered:true});
new PerformanceObserver(l=>{for(const e of l.getEntries())__lcp=e.startTime}).observe({type:'largest-contentful-paint',buffered:true});}catch(e){}"""
FR = """(ms)=>new Promise(r=>{const d=[];let l=performance.now();const s=l;function f(t){d.push(t-l);l=t;if(t-s<ms)requestAnimationFrame(f);else r(d)}requestAnimationFrame(f)})"""
def m(x): return {e['name']: e['value'] for e in x['metrics']}
async def main():
  res = json.load(open(outp)) if os.path.exists(outp) else {}
  async with async_playwright() as p:
    b = await p.chromium.launch(executable_path=EXE, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
    for e in eng:
      for c in CONF:
        ctx = await b.new_context(viewport={'width': c['w'], 'height': c['h']}, device_scale_factor=c['dpr'], is_mobile=c['mob'], has_touch=c['mob'])
        await ctx.route('**/*', handler)
        await ctx.add_init_script("localStorage.setItem('cookies','essential');sessionStorage.setItem('cc_demo_seen','1');localStorage.setItem('theme','dark');localStorage.setItem('cc_promo_dismissed','1')")
        await ctx.add_init_script(OBS)
        if e != 'none': await ctx.add_init_script("if(!/proto-bg/.test(location.pathname))" + (INJ % e.split("&")[0]))
        for pg in pages:
          q = await ctx.new_page(); cdp = await ctx.new_cdp_session(q)
          await cdp.send('Performance.enable'); await cdp.send('Emulation.setCPUThrottlingRate', {'rate': c['cpu']})
          layers = []
          cdp.on('LayerTree.layerTreeDidChange', lambda ev, L=layers: L.append(ev.get('layers') or []))
          await q.goto(f'http://127.0.0.1:9611/proto-bg/index.html?e={e}' if pg == 'proto' else f'http://127.0.0.1:9611/{pg}.html?' + e.partition('&')[2] if '&' in e else f'http://127.0.0.1:9611/{pg}.html'); await q.wait_for_timeout(3500)
          m0 = m(await cdp.send('Performance.getMetrics'))
          idle = await q.evaluate(FR, 4000)
          m1 = m(await cdp.send('Performance.getMetrics'))
          dt = m1['Timestamp'] - m0['Timestamp']
          await cdp.send('LayerTree.enable'); await q.wait_for_timeout(700); await cdp.send('LayerTree.disable')
          L = layers[-1] if layers else []
          drawn = [l for l in L if l.get('drawsContent')]
          area = sum(l['width'] * l['height'] for l in drawn) * c['dpr'] ** 2 * 4 / 2**20
          bgl = [l for l in drawn if l['width'] >= c['w'] - 2 and l['height'] >= c['h'] - 2]
          # scroll: real compositor scroll gesture while rAF intervals are recorded
          sc = asyncio.ensure_future(q.evaluate(FR, 3000)); await q.wait_for_timeout(50)
          s0 = m(await cdp.send('Performance.getMetrics'))
          try: await cdp.send('Input.synthesizeScrollGesture', {'x': c['w'] // 2, 'y': c['h'] // 2, 'yDistance': -2400, 'speed': 1200, 'gestureSourceType': 'touch' if c['mob'] else 'mouse'})
          except Exception as ex: pass
          sfr = await sc; s1 = m(await cdp.send('Performance.getMetrics'))
          sfr = sorted(sfr[1:]); n = len(sfr)
          cls, lcp, bgs = await q.evaluate('[__cls,__lcp,__bgshift]')
          res[f'{e}|{pg}|{c["name"]}'] = dict(
            idle_task_ms_per_s=round((m1['TaskDuration'] - m0['TaskDuration']) / dt * 1000, 1),
            idle_script_ms_per_s=round((m1['ScriptDuration'] - m0['ScriptDuration']) / dt * 1000, 1),
            idle_paint_style_layout_ms_per_s=round(((m1['RecalcStyleDuration'] - m0['RecalcStyleDuration']) + (m1['LayoutDuration'] - m0['LayoutDuration'])) / dt * 1000, 1),
            idle_fps=round(len(idle) / 4, 1), idle_p95_ms=round(sorted(idle)[int(len(idle) * .95) - 1], 1),
            heap_mb=round(m1['JSHeapUsedSize'] / 2**20, 2), nodes=int(m1['Nodes']), layers=len(L), drawn_layers=len(drawn), layer_mem_mb_est=round(area, 1), fullscreen_layers=len(bgl),
            scroll_task_ms_per_s=round((s1['TaskDuration'] - s0['TaskDuration']) / (s1['Timestamp'] - s0['Timestamp']) * 1000, 1),
            scroll_fps=round(n / 3, 1), scroll_p95_ms=round(sfr[int(n * .95) - 1], 1) if n else None, scroll_over_25ms=sum(1 for x in sfr if x > 25),
            cls=round(cls, 4), cls_from_bg=round(bgs, 4), lcp_ms=round(lcp))
          print(e, pg, c['name'], flush=True); json.dump(res, open(outp, 'w'), indent=1)
          await q.close()
        await ctx.close()
    await b.close()
  json.dump(res, open(outp, 'w'), indent=1)
asyncio.run(main())

# which opaque element is the first painted background at a grid of viewport points (top of page)
import sys, os, asyncio, json, collections
sys.path.insert(0, '/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/uifix')
from shoot import handler, EXE
from playwright.async_api import async_playwright
PORT=os.environ.get('PORT','9611')
JS="""()=>{const c=collections={};const name=e=>e.tagName.toLowerCase()+(e.id?'#'+e.id:'')+(e.className&&e.className.baseVal===undefined?'.'+String(e.className).trim().split(/\\s+/).slice(0,2).join('.'):'');
for(let y=5;y<innerHeight;y+=40)for(let x=5;x<innerWidth;x+=40){const els=document.elementsFromPoint(x,y);let hit='(canvas)';for(const e of els){const b=getComputedStyle(e).backgroundColor;const im=getComputedStyle(e).backgroundImage;if((b&&b!=='rgba(0, 0, 0, 0)'&&b!=='transparent')||im!=='none'){hit=name(e)+' '+b;break}}c[hit]=(c[hit]||0)+1}return c}"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=EXE,args=['--no-sandbox'])
    for theme in ('light','dark'):
     for w in (412,1440):
      ctx=await b.new_context(viewport={'width':w,'height':900},is_mobile=w<800,reduced_motion='reduce')
      await ctx.route('**/*',handler); await ctx.add_init_script(f"localStorage.setItem('cookies','essential');sessionStorage.setItem('cc_demo_seen','1');localStorage.setItem('theme','{theme}')")
      for pg in sys.argv[1].split(','):
        q=await ctx.new_page(); await q.goto(f'http://127.0.0.1:{PORT}/{pg}.html'); await q.wait_for_timeout(1500)
        for sc in (0,1200):
          await q.evaluate(f'scrollTo(0,{sc})'); await q.wait_for_timeout(200)
          r=await q.evaluate(JS); tot=sum(r.values())
          print(theme,w,pg,sc,{k:round(v/tot,2) for k,v in sorted(r.items(),key=lambda x:-x[1])[:6]})
        await q.close()
      await ctx.close()
    await b.close()
asyncio.run(main())

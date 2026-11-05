import sys,asyncio
sys.path.insert(0,'/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/uifix')
from shoot import handler,EXE
from playwright.async_api import async_playwright
from PIL import Image, ImageChops
import os
BASE=int(os.environ.get('BASE',9212)); NEW=int(os.environ.get('NEW',9211)); OUT=os.environ.get('OUT','qa/static'); os.makedirs(OUT,exist_ok=True)
PAGES=os.environ.get('PAGES','index,dashboard,courses,signin,announcements,launchpad,offline,onboarding,card,404').split(',')
async def m():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path=EXE,args=['--no-sandbox']); out=[]
    for pg in PAGES:
      for w,h,full in ((1536,864,False),(1536,864,True),(412,860,False)):
        ims=[]
        for port in (BASE,NEW):
          ctx=await b.new_context(viewport={'width':w,'height':h}); await ctx.route('**/*',handler)
          await ctx.add_init_script("localStorage.setItem('cookies','essential')")
          q=await ctx.new_page(); await q.goto(f'http://127.0.0.1:{port}/{pg}.html?static=1',wait_until='load'); await q.wait_for_timeout(2500)
          f=f'{OUT}/static-{pg}-{w}-{full}-{port}.png'; await q.screenshot(path=f,full_page=full); ims.append(Image.open(f).convert('RGB')); await ctx.close()
        d=ImageChops.difference(ims[0],ims[1]) if ims[0].size==ims[1].size else None
        n=sum(1 for px in d.getdata() if px!=(0,0,0)) if d else -1
        out.append((pg,w,full,n)); print(pg,w,'full' if full else 'view','diffpx',n)
    await b.close()
    bad=[o for o in out if o[3]!=0]; print('TOTAL',len(out),'NONZERO',len(bad), bad)
asyncio.run(m())

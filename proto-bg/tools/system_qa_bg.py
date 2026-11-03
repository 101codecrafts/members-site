# usage: PORT=8811 [THEMES=light,dark] python3 qa.py OUTDIR pages|all widths [shots]
# THEMES (default light): each theme is forced via localStorage.theme + emulated prefers-color-scheme; dark results are keyed page@w@dark.
# pages 'all' = every root *.html of REPO (env, default ../theme/repo), the same list crawl.py walks.
# Per page x width: horizontal overflow, text contrast failures (computed styles, WCAG 1.4.3), empty/oversized card slabs.
# Uses reduced motion so scroll-reveal content is visible in full-page screenshots.
import sys, os, json, asyncio
sys.path.insert(0, '/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/uifix')
from shoot import handler, EXE
from playwright.async_api import async_playwright
PORT = int(os.environ.get('PORT', '8811'))
OUT = sys.argv[1]; PAGES = sys.argv[2].split(',');
THEMES = os.environ.get('THEMES', 'light').split(',')
if PAGES == ['all']:
    import glob; PAGES = sorted(os.path.basename(f)[:-5] for f in glob.glob(os.environ.get('REPO', os.path.join(os.path.dirname(os.path.abspath(__file__)), '../theme/repo')) + '/*.html'))
WIDTHS = [int(w) for w in sys.argv[3].split(',')]
SHOTS = len(sys.argv) > 4 and sys.argv[4] == 'shots'
os.makedirs(OUT, exist_ok=True)
JS = r'''()=>{
 const parse=c=>{const m=c.match(/rgba?\(([^)]+)\)/); if(!m) return null; const p=m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0],p[1],p[2],p.length>3?p[3]:1]};
 const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4)};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
 const ratio=(a,b)=>{const L1=lum(a),L2=lum(b);return (Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05)};
 const blend=(fg,bg)=>[0,1,2].map(i=>fg[i]*fg[3]+bg[i]*(1-fg[3]));
 const desc=e=>{let s=e.tagName.toLowerCase(); if(e.id) s+='#'+e.id; if(typeof e.className=='string'&&e.className.trim()) s+='.'+e.className.trim().split(/\s+/).slice(0,2).join('.'); const p=e.parentElement; if(p){let q=p.tagName.toLowerCase(); if(typeof p.className=='string'&&p.className.trim()) q+='.'+p.className.trim().split(/\s+/)[0]; s=q+'>'+s} return s};
 function bgOf(e){ let layers=[]; let x=e; while(x){ const cs=getComputedStyle(x);
   if(cs.backgroundImage&&cs.backgroundImage!='none'&&!/^url\(.*\.svg/.test(cs.backgroundImage)) return {img:true};
   const c=parse(cs.backgroundColor); if(c&&c[3]>0){ layers.push(c); if(c[3]>=0.99) break; }
   x=x.parentElement; }
   let base=[255,255,255]; for(let i=layers.length-1;i>=0;i--) base=blend(layers[i],base); return {c:base}; }
 const out={sw:document.documentElement.scrollWidth,iw:innerWidth,fails:[],nfail:0,checked:0,img:0,slabs:[]};
 const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let n;const seen=new Set();
 while(n=w.nextNode()){ if(!n.textContent.trim())continue; const e=n.parentElement; if(!e||seen.has(e))continue; seen.add(e);
   const cs=getComputedStyle(e); if(cs.visibility=='hidden'||cs.display=='none')continue; const r=e.getBoundingClientRect(); if(r.width<1||r.height<1)continue;
   if(e.closest('[aria-hidden="true"],.sr-only,script,style,noscript,svg,[disabled],option,.static-only'))continue;
   let op=1,x=e; while(x&&x!==document.body){op*=parseFloat(getComputedStyle(x).opacity); x=x.parentElement} if(op<0.05)continue;
   if(e.closest('input,textarea,select')) continue;
   const fg=parse(cs.color); if(!fg) continue; const b=bgOf(e); if(b.img){out.img++;continue}
   const fgc=blend([fg[0],fg[1],fg[2],fg[3]*op],b.c); const cr=ratio(fgc,b.c); out.checked++;
   const fs=parseFloat(cs.fontSize), fw=parseInt(cs.fontWeight)||400; const large=fs>=24||(fs>=18.66&&fw>=700);
   const need=large?3:4.5;
   if(cr<need){ out.nfail++; if(out.fails.length<60) out.fails.push({el:desc(e),txt:n.textContent.trim().slice(0,30),ratio:+cr.toFixed(2),need,fg:cs.color,bg:'rgb('+b.c.map(Math.round).join(',')+')',fs}); }
 }
 // slabs: boxes with a border or bg colour, height > 120, whose content occupies < 45% of the area
 document.querySelectorAll('main *, .main *, .content *').forEach(el=>{ const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
   if(r.height<140||r.width<120||cs.display=='inline') return; const hasBox=(parseFloat(cs.borderTopWidth)>=2)||(parse(cs.backgroundColor)||[0,0,0,0])[3]>0.9; if(!hasBox) return;
   if(el.querySelector('img,canvas,video,iframe,svg.big')) return;
   let maxB=r.top; for(const c of el.children){ const cr=c.getBoundingClientRect(); if(cr.height>0) maxB=Math.max(maxB,cr.bottom)}
   const used=(maxB-r.top)/r.height; if(el.children.length && used<0.55 && r.height-(maxB-r.top)>90) out.slabs.push({el:desc(el),h:Math.round(r.height),empty:Math.round(r.height-(maxB-r.top))});
 });
 out.slabs=out.slabs.slice(0,25);
 return out}'''
async def main():
    res = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=EXE, args=['--no-sandbox'])
        for th, w in [(t, w) for t in THEMES for w in WIDTHS]:
            mob = w <= 980; sfx = '' if th == 'light' else '@' + th
            ctx = await b.new_context(viewport={'width': w, 'height': 900}, device_scale_factor=1, is_mobile=mob, has_touch=mob, reduced_motion='reduce', color_scheme='dark' if th == 'dark' else 'light')
            await ctx.route('**/*', handler)
            await ctx.add_init_script("localStorage.setItem('cookies','essential');sessionStorage.setItem('cc_demo_seen','1');localStorage.setItem('theme','" + th + "')")
            if os.environ.get('BGENG'): await ctx.add_init_script("window.CCBG_ENGINE='" + os.environ['BGENG'] + "';addEventListener('DOMContentLoaded',function(){var s=document.createElement('script');s.src='/proto-bg/loader.js';document.head.appendChild(s)})")
            async def one(pg):
                page = await ctx.new_page(); errs = []
                page.on('pageerror', lambda x: errs.append(str(x)[:150]))
                try:
                    await page.goto(f'http://127.0.0.1:{PORT}/{pg}.html', wait_until='domcontentloaded', timeout=20000)
                    await page.wait_for_timeout(int(os.environ.get('WAIT','2500')))
                    r = await page.evaluate(JS)
                    if SHOTS: await page.screenshot(path=f'{OUT}/{pg}-{w}{sfx.replace("@", "-")}.png', full_page=True)
                except Exception as ex:
                    r = {'fail': str(ex)[:150]}
                r['errs'] = errs; await page.close(); return pg, r
            for i in range(0, len(PAGES), 5):
                for pg, r in await asyncio.gather(*[one(x) for x in PAGES[i:i+5]]):
                    res[f'{pg}@{w}{sfx}'] = r
            await ctx.close()
    json.dump(res, open(f'{OUT}/qa.json', 'w'), indent=1)
    tot = 0; per = {}
    for k, r in res.items():
        if r.get('fail'): print(k, 'FAIL', r['fail']); continue
        tot += r['nfail']; t = k.split('@')[2] if k.count('@') > 1 else 'light'; per[t] = per.get(t, 0) + r['nfail']
        print(f"{k:28s} overflow={r['sw']-r['iw']:4d} contrastFails={r['nfail']:3d}/{r['checked']} slabs={len(r['slabs'])} errs={len(r['errs'])}")
    print('TOTAL contrast fails', tot, per)
asyncio.run(main())

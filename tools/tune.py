"""Auto-fit text elements to the mockup.
For every leaf text element: find its ink box in the mockup and in the render (same local window),
then nudge position (translate) and, for single-line text, font-size / vertical scale so the boxes match.
A change is kept only if the local SSIM of that element's window improves.
Writes css/<page>.fit.css (plain CSS overrides keyed by structural selectors).
usage: tune.py page.html ref.png W H out.css [passes]
"""
import sys, os, json, asyncio, io
import numpy as np
from PIL import Image
from skimage.metrics import structural_similarity as ssim
from playwright.async_api import async_playwright

page, refp, W, H, outcss = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
PASSES = int(sys.argv[6]) if len(sys.argv) > 6 else 4
REF = np.array(Image.open(refp).convert('L')).astype(float)
PX, PY = 6, 4

JS_COLLECT = r"""
() => {
  const root = document.querySelector('.app, .page');
  const out = [];
  const path = el => { const p=[]; while (el && el !== root) { const i=[...el.parentElement.children].indexOf(el)+1; p.unshift(`:nth-child(${i})`); el = el.parentElement; } return (root.classList.contains('app')?'.app':'.page')+' > '+p.join(' > '); };
  root.querySelectorAll('*').forEach(el => {
    if (el.closest('svg')) return;
    const own = [...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim().length>1);
    if (!own) return;
    const r = el.getBoundingClientRect();
    if (r.width<4 || r.height<4) return;
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize)*1.25;
    out.push({sel:path(el), x:r.left, y:r.top, w:r.width, h:r.height, fs:parseFloat(cs.fontSize), single: r.height < lh*1.6});
  });
  return out;
}"""

def ink(a):
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border)
    m = np.abs(a - bg) > 55
    ys, xs = np.where(m)
    if len(xs) < 6: return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1

def win(e):
    x0 = max(0, int(e['x'] - PX)); y0 = max(0, int(e['y'] - PY))
    x1 = min(W, int(e['x'] + e['w'] + PX)); y1 = min(H, int(e['y'] + e['h'] + PY))
    return x0, y0, x1, y1

def lssim(A, B, w):
    x0, y0, x1, y1 = w
    a, b = A[y0:y1, x0:x1], B[y0:y1, x0:x1]
    if min(a.shape) < 7: return 0
    return ssim(a, b, data_range=255)

async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--font-render-hinting=none'])
        pg = await br.new_page(viewport={'width': W, 'height': H})
        await pg.goto('file://' + os.path.abspath(page) + '?static=1&notune=1')
        await pg.evaluate('document.fonts.ready'); await pg.wait_for_timeout(300)
        await pg.evaluate("()=>{const l=document.getElementById('fitcss'); if(l) l.remove();}"); await pg.wait_for_timeout(100)
        els = await pg.evaluate(JS_COLLECT)
        state = {e['sel']: {'dx': 0.0, 'dy': 0.0, 'fs': e['fs'], 'k': 1.0, 'fs0': e['fs']} for e in els}
        info = {e['sel']: e for e in els}

        async def apply(st):
            css = ''.join(f"{s}{{translate:{v['dx']:.2f}px {v['dy']:.2f}px;font-size:{v['fs']:.2f}px !important;scale:1 {v['k']:.4f};transform-origin:0 0}}\n" for s, v in st.items() if v['dx'] or v['dy'] or v['fs'] != v['fs0'] or v['k'] != 1)
            await pg.evaluate("css => { let s=document.getElementById('__tune'); if(!s){s=document.createElement('style');s.id='__tune';document.head.appendChild(s);} s.textContent=css; }", css)
            await pg.wait_for_timeout(60)
            return css

        async def shot():
            b = await pg.screenshot()
            return np.array(Image.open(io.BytesIO(b)).convert('L')).astype(float)

        await apply(state)
        cur = await shot()
        base = {s: lssim(REF, cur, win(info[s])) for s in state}
        print('elements', len(els), 'mean local ssim', round(float(np.mean(list(base.values()))), 4))
        for it in range(PASSES):
            prop = {}
            for s, e in info.items():
                w = win(e); x0, y0, x1, y1 = w
                # account for current translate when locating the window
                v = state[s]
                w2 = (max(0, int(x0 + v['dx'])), max(0, int(y0 + v['dy'])), min(W, int(x1 + v['dx']) + 1), min(H, int(y1 + v['dy']) + 1))
                a = ink(REF[w2[1]:w2[3], w2[0]:w2[2]]); b = ink(cur[w2[1]:w2[3], w2[0]:w2[2]])
                if not a or not b: continue
                nv = dict(v)
                if e['single'] and it < PASSES - 1:
                    rw, bw = a[2] - a[0], b[2] - b[0]; rh, bh = a[3] - a[1], b[3] - b[1]
                    if bw > 8 and 0.85 < rw / bw < 1.15: nv['fs'] = v['fs'] * rw / bw
                    if bh > 5 and 0.85 < (rh / bh) < 1.15: nv['k'] = max(.85, min(1.3, v['k'] * (rh / bh) / (rw / bw if bw > 8 and 0.85 < rw / bw < 1.15 else 1)))
                nv['dx'] = v['dx'] + max(-6, min(6, a[0] - b[0]))
                nv['dy'] = v['dy'] + max(-6, min(6, a[1] - b[1]))
                prop[s] = nv
            trial = dict(state); trial.update(prop)
            await apply(trial)
            new = await shot()
            kept = 0
            for s in prop:
                w = win(info[s]); w = (max(0, w[0] - 6), max(0, w[1] - 6), min(W, w[2] + 6), min(H, w[3] + 6))
                if lssim(REF, new, w) > lssim(REF, cur, w) + 0.002:
                    state[s] = prop[s]; kept += 1
            await apply(state)
            cur = await shot()
            full = ssim(REF, cur, data_range=255)
            print(f'pass {it+1}: kept {kept}/{len(prop)} gray-ssim {full:.4f}')
        css = await apply(state)
        open(outcss, 'w').write('/* generated by tools/tune.py: per-element nudges that align text with the mockup */\n' + css)
        await br.close()

asyncio.run(main())

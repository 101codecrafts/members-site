import sys,json
import numpy as np
from PIL import Image
# ink.py ref ren "name:x0,y0,x1,y1:mode" ...  mode dark|light : bbox of ink pixels in region for both images
R=np.array(Image.open(sys.argv[1]).convert('L')).astype(int); N=np.array(Image.open(sys.argv[2]).convert('L')).astype(int)
for spec in sys.argv[3:]:
    name,box,mode=spec.split(':'); x0,y0,x1,y1=map(int,box.split(','))
    out=[]
    for A in (R,N):
        a=A[y0:y1,x0:x1]
        m = a<80 if mode=='dark' else a>170
        ys,xs=np.where(m)
        out.append((x0+xs.min(),y0+ys.min(),x0+xs.max()+1,y0+ys.max()+1) if len(xs) else None)
    print(f"{name:12s} ref={out[0]} ren={out[1]}")

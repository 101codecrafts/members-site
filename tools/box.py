import sys
from PIL import Image
import numpy as np
im=np.array(Image.open(sys.argv[1]).convert('RGB')).astype(int)
def ext(x,y,tol=40):
    c=im[y,x]
    def ok(px): return abs(px-c).sum()<tol
    l=x
    while l>0 and ok(im[y,l-1]): l-=1
    r=x
    while r<im.shape[1]-1 and ok(im[y,r+1]): r+=1
    t=y
    while t>0 and ok(im[t-1,x]): t-=1
    b=y
    while b<im.shape[0]-1 and ok(im[b+1,x]): b+=1
    return l,t,r+1,b+1,'#%02x%02x%02x'%tuple(c)
for arg in sys.argv[2:]:
    name,xy=arg.split('=');x,y=map(int,xy.split(','))
    print(name,ext(x,y))

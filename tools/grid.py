import sys
from PIL import Image, ImageDraw
# grid.py img x0 y0 x1 y1 scale out
a=sys.argv; im=Image.open(a[1]).convert('RGB'); x0,y0,x1,y1=map(int,a[2:6]); s=float(a[6])
c=im.crop((x0,y0,x1,y1)).resize((int((x1-x0)*s),int((y1-y0)*s)),Image.LANCZOS)
d=ImageDraw.Draw(c)
for x in range((x0//20+1)*20,x1,20):
    X=(x-x0)*s; d.line([(X,0),(X,6 if x%100 else 14)],fill=(255,0,255)); 
    if x%100==0: d.text((X+2,0),str(x),fill=(255,0,255))
for y in range((y0//20+1)*20,y1,20):
    Y=(y-y0)*s; d.line([(0,Y),(6 if y%100 else 14,Y)],fill=(255,0,255))
    if y%100==0: d.text((0,Y+2),str(y),fill=(255,0,255))
c.save(a[7])

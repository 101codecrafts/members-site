import sys, json
import numpy as np
from PIL import Image
from skimage.metrics import structural_similarity as ssim
# compare.py ref render name regions.json
ref=Image.open(sys.argv[1]).convert('RGB'); ren=Image.open(sys.argv[2]).convert('RGB').resize(ref.size)
name=sys.argv[3]; regions=json.load(open(sys.argv[4])) if len(sys.argv)>4 else {}
R=np.array(ref); N=np.array(ren)
def score(a,b):
    return ssim(a,b,channel_axis=2,data_range=255)
full=score(R,N)
out={'full':round(full,4)}
for k,(x0,y0,x1,y1) in regions.items():
    out[k]=round(score(R[y0:y1,x0:x1],N[y0:y1,x0:x1]),4)
d=np.abs(R.astype(int)-N.astype(int)).sum(2).clip(0,255).astype(np.uint8)
heat=Image.fromarray(d).convert('L')
heat=Image.merge('RGB',(heat,Image.new('L',ref.size,0),Image.new('L',ref.size,0)))
Image.blend(ref,heat,0.6).save(f'compare/diff-{name}.png')
W,H=ref.size
sb=Image.new('RGB',(W*2+10,H),'white'); sb.paste(ref,(0,0)); sb.paste(ren,(W+10,0)); sb.save(f'compare/side-{name}.png')
print(json.dumps(out))

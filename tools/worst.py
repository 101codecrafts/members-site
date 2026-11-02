import sys
import numpy as np
from PIL import Image
from skimage.metrics import structural_similarity as ssim
R=np.array(Image.open(sys.argv[1]).convert('L')); N=np.array(Image.open(sys.argv[2]).convert('L'))
_,S=ssim(R,N,full=True,data_range=255)
B=int(sys.argv[3]) if len(sys.argv)>3 else 64
H,W=S.shape; rows=[]
for y in range(0,H,B):
  for x in range(0,W,B):
    rows.append((S[y:y+B,x:x+B].mean(),x,y))
rows.sort()
print(' '.join(f"({x},{y}):{v:.2f}" for v,x,y in rows[:40]))

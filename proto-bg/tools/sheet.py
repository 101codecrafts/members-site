import sys
from PIL import Image
out, files = sys.argv[1], sys.argv[2:]
ims = [Image.open(f) for f in files]; h = 860
ims = [i.resize((int(i.width * h / i.height), h)) for i in ims]
s = Image.new('RGB', (sum(i.width for i in ims) + 8 * (len(ims) - 1), h), 'white'); x = 0
for i in ims: s.paste(i, (x, 0)); x += i.width + 8
s.save(out)

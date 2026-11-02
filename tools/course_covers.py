"""Generate local SVG cover placeholders for the courses catalog (no third-party images are hotlinked).
External covers are branded per provider with its name in text only (no trademarked logos); 101 covers use brand colours.
usage: python3 tools/course_covers.py  → assets/img/courses/*.svg"""
import pathlib, html
out = pathlib.Path(__file__).resolve().parent.parent / 'assets/img/courses'; out.mkdir(parents=True, exist_ok=True)
# key: (label, bg1, bg2, text colour, accent)
PROVIDERS = {
  'coursera':      ('Coursera',        '#0056D2', '#003A8C', '#ffffff', '#7FB2FF'),
  'edx':           ('edX',             '#02262B', '#0D3B40', '#ffffff', '#D23228'),
  'freecodecamp':  ('freeCodeCamp',    '#0A0A23', '#1B1B32', '#ffffff', '#F1BE32'),
  'google':        ('Google',          '#1A73E8', '#0B57D0', '#ffffff', '#FBBC04'),
  'microsoft':     ('Microsoft Learn', '#0067B8', '#004E8C', '#ffffff', '#7FBA00'),
  'cisco':         ('Cisco NetAcad',   '#005073', '#003A55', '#ffffff', '#049FD9'),
  'khan':          ('Khan Academy',    '#0B3D35', '#14594C', '#ffffff', '#14BF96'),
  'alison':        ('Alison',          '#8F1020', '#5E0A15', '#ffffff', '#FF6B6B'),
}
INTERNAL = {  # 101 Codecrafts covers by category
  '101-web':      ('WEB DEV',       '#0B1236', '#111A45', '#fc8c0c'),
  '101-data':     ('DATA & AI',     '#0B1236', '#26306A', '#05e6f2'),
  '101-security': ('CYBERSECURITY', '#0B1236', '#111A45', '#d93636'),
  '101-network':  ('NETWORKING',    '#0B1236', '#26306A', '#05e6f2'),
  '101-cloud':    ('CLOUD',         '#0B1236', '#111A45', '#fc8c0c'),
  '101-python':   ('PYTHON',        '#0B1236', '#26306A', '#fc8c0c'),
  '101-kids':     ('SCRATCH & CODE','#0B1236', '#111A45', '#05e6f2'),
}
def svg(key, label, b1, b2, fg, acc, sub):
    lab = html.escape(label); fs = 64 if len(label) <= 8 else 44 if len(label) <= 12 else 34
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360" role="img" aria-label="{lab} cover">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{b1}"/><stop offset="1" stop-color="{b2}"/></linearGradient>
<pattern id="p" width="24" height="24" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="24" fill="#ffffff" opacity=".05"/></pattern></defs>
<rect width="640" height="360" fill="url(#g)"/><rect width="640" height="360" fill="url(#p)"/>
<rect x="430" y="-40" width="260" height="260" fill="{acc}" opacity=".9" transform="rotate(18 560 90)"/>
<rect x="470" y="40" width="120" height="120" fill="none" stroke="{b1}" stroke-width="10" transform="rotate(18 530 100)"/>
<rect x="36" y="300" width="96" height="14" fill="{acc}"/>
<text x="36" y="{176 + fs//3}" font-family="Archivo Black, Impact, Arial Black, sans-serif" font-size="{fs}" fill="{fg}">{lab}</text>
<text x="36" y="282" font-family="Barlow, Arial, sans-serif" font-weight="700" font-size="22" letter-spacing="3" fill="{fg}" opacity=".85">{html.escape(sub)}</text>
</svg>'''
for k, (label, b1, b2, fg, acc) in PROVIDERS.items():
    (out / f'{k}.svg').write_text(svg(k, label, b1, b2, fg, acc, 'FREE COURSE · 101 PICK'))
for k, (label, b1, b2, acc) in INTERNAL.items():
    (out / f'{k}.svg').write_text(svg(k, label, b1, b2, '#ffffff', acc, '101 CODECRAFTS · TUTOR-LED'))
print('wrote', len(PROVIDERS) + len(INTERNAL), 'covers to', out)

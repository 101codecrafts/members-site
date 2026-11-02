"""Generate local SVG placeholders for the Marketplace (no hotlinked images).
usage: python3 tools/market_svgs.py  → assets/img/market/*.svg
Each product art = brand-coloured tile + a simple glyph for its kind + a label. Swap for real photos (WebP, 800x800) later."""
import pathlib, html
out = pathlib.Path(__file__).resolve().parent.parent / 'assets/img/market'; out.mkdir(parents=True, exist_ok=True)
INK, NAVY2, OR, CY, PAPER = '#0B1236', '#26306A', '#fc8c0c', '#05e6f2', '#f7f8f9'
G = {  # glyphs drawn in a 400x400 box, centre ~ (200,190)
 'laptop':  '<rect x="90" y="110" width="220" height="140" rx="6" fill="{f}" stroke="{s}" stroke-width="10"/><rect x="60" y="250" width="280" height="22" fill="{s}"/>',
 'phone':   '<rect x="140" y="80" width="120" height="220" rx="16" fill="{f}" stroke="{s}" stroke-width="10"/><rect x="180" y="276" width="40" height="8" fill="{s}"/>',
 'board':   '<rect x="90" y="110" width="220" height="150" fill="{f}" stroke="{s}" stroke-width="10"/><rect x="170" y="155" width="60" height="60" fill="{s}"/>' + ''.join(f'<rect x="{x}" y="92" width="10" height="18" fill="{{s}}"/><rect x="{x}" y="260" width="10" height="18" fill="{{s}}"/>' for x in range(110, 300, 24)),
 'chip':    '<rect x="130" y="120" width="140" height="140" fill="{s}"/>' + ''.join(f'<rect x="{x}" y="96" width="10" height="24" fill="{{s}}"/><rect x="{x}" y="260" width="10" height="24" fill="{{s}}"/>' for x in range(142, 270, 26)) + '<circle cx="160" cy="150" r="10" fill="{f}"/>',
 'software':'<rect x="80" y="100" width="240" height="170" fill="{f}" stroke="{s}" stroke-width="10"/><rect x="80" y="100" width="240" height="30" fill="{s}"/><path d="M150 170l-30 30 30 30M250 170l30 30-30 30M215 160l-30 80" fill="none" stroke="{s}" stroke-width="12"/>',
 'template':'<rect x="80" y="90" width="240" height="190" fill="{f}" stroke="{s}" stroke-width="10"/><rect x="100" y="110" width="200" height="40" fill="{s}"/><rect x="100" y="165" width="90" height="95" fill="{s}" opacity=".6"/><rect x="205" y="165" width="95" height="40" fill="{s}" opacity=".35"/><rect x="205" y="220" width="95" height="40" fill="{s}" opacity=".35"/>',
 'course':  '<path d="M200 90l140 60-140 60-140-60z" fill="{s}"/><path d="M110 175v60c0 25 40 45 90 45s90-20 90-45v-60l-90 40z" fill="{f}" stroke="{s}" stroke-width="10"/>',
 'book':    '<path d="M80 110c40-10 80 0 115 20v160c-35-20-75-30-115-20z" fill="{f}" stroke="{s}" stroke-width="10"/><path d="M320 110c-40-10-80 0-115 20v160c35-20 75-30 115-20z" fill="{s}"/>',
 'service': '<circle cx="200" cy="150" r="50" fill="{f}" stroke="{s}" stroke-width="10"/><path d="M110 290c0-55 40-90 90-90s90 35 90 90z" fill="{s}"/>',
 'headset': '<path d="M110 220v-30a90 90 0 0 1 180 0v30" fill="none" stroke="{s}" stroke-width="14"/><rect x="90" y="200" width="50" height="80" fill="{s}"/><rect x="260" y="200" width="50" height="80" fill="{s}"/>',
 'router':  '<rect x="80" y="190" width="240" height="80" fill="{f}" stroke="{s}" stroke-width="10"/><path d="M130 190l-20-90M270 190l20-90" stroke="{s}" stroke-width="10"/><circle cx="130" cy="230" r="8" fill="{s}"/><circle cx="160" cy="230" r="8" fill="{s}"/>',
 'sensor':  '<circle cx="200" cy="185" r="70" fill="{f}" stroke="{s}" stroke-width="10"/><circle cx="200" cy="185" r="26" fill="{s}"/><path d="M110 95a130 130 0 0 1 180 0M135 120a95 95 0 0 1 130 0" fill="none" stroke="{s}" stroke-width="10"/>',
 'bag':     '<path d="M100 140h200l-20 150H120z" fill="{f}" stroke="{s}" stroke-width="10"/><path d="M155 140v-25a45 45 0 0 1 90 0v25" fill="none" stroke="{s}" stroke-width="10"/>',
}
SCHEMES = [(INK, OR, PAPER), (NAVY2, CY, PAPER), (OR, INK, '#fff4e5'), (CY, INK, '#e9fdff'), (PAPER, INK, OR)]
ART = {  # file: (glyph, label, scheme index)
 'laptop-hp': ('laptop', 'LAPTOP', 0), 'laptop-dell': ('laptop', 'LAPTOP', 1), 'phone-tecno': ('phone', 'PHONE', 2),
 'esp32': ('board', 'ESP32', 3), 'arduino': ('board', 'ARDUINO', 2), 'pi': ('board', 'RASPBERRY PI', 1), 'sensor-kit': ('sensor', 'SENSOR KIT', 0),
 'chip-set': ('chip', 'COMPONENTS', 4), 'router': ('router', 'ROUTER', 1), 'headset': ('headset', 'HEADSET', 3),
 'app-pos': ('software', 'POS APP', 0), 'app-school': ('software', 'SCHOOL SYS', 2), 'app-bot': ('software', 'WA BOT', 3), 'app-sacco': ('software', 'SACCO APP', 1),
 'ui-kit': ('template', 'UI KIT', 2), 'web-tpl': ('template', 'TEMPLATE', 0), 'deck-tpl': ('template', 'PITCH DECK', 4),
 'course-web': ('course', 'WEB BUNDLE', 0), 'course-data': ('course', 'DATA BUNDLE', 1), 'course-sec': ('course', 'CYBER BUNDLE', 2),
 'svc-design': ('service', 'DESIGN', 3), 'svc-dev': ('service', 'DEV', 0), 'svc-tutor': ('service', 'TUTORING', 2),
 'book-py': ('book', 'PYTHON', 1), 'book-net': ('book', 'NETWORKING', 4), 'book-algo': ('book', 'ALGORITHMS', 0),
 'aff-amazon': ('bag', 'AMAZON PICK', 4), 'aff-alibaba': ('bag', 'ALIBABA PICK', 2), 'placeholder': ('bag', '101 MARKET', 0),
}
def tile(glyph, label, sch, view=''):
    bg, fg, card = SCHEMES[sch]
    g = G[glyph].replace('{f}', card).replace('{s}', fg)
    tf = {'': '', 'side': ' transform="rotate(-12 200 190)"', 'top': ' transform="translate(0 -10) scale(1 .8) translate(0 50)"', 'detail': ' transform="translate(-200 -190) scale(2)"'}[view]
    lab = html.escape(label + ('' if not view else ' · ' + view.upper()))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400" role="img" aria-label="{lab} placeholder">
<rect width="400" height="400" fill="{bg}"/><rect x="0" y="330" width="400" height="70" fill="{fg}"/>
<g{tf}>{g}</g>
<text x="20" y="376" font-family="Archivo Black, Impact, Arial Black, sans-serif" font-size="26" fill="{bg}">{lab}</text>
</svg>'''
for k, (g, l, s) in ART.items():
    (out / f'{k}.svg').write_text(tile(g, l, s))
    for v in ('side', 'top', 'detail'): (out / f'{k}--{v}.svg').write_text(tile(g, l, s, v))
# hero banners 1200x400
HERO = {
 'hero-laptops': ('BACK-TO-CAMPUS LAPTOPS', 'Up to 25% off · boda delivery in Kampala', INK, OR, 'laptop'),
 'hero-iot': ('IOT STARTER WEEK', 'ESP32, sensors & kits from member sellers', NAVY2, CY, 'board'),
 'hero-made101': ('MADE BY 101 MEMBERS', 'Apps, templates & services built here', OR, INK, 'software'),
}
for k, (t, sub, bg, acc, gl) in HERO.items():
    g = G[gl].replace('{f}', '#fff').replace('{s}', INK)
    (out / f'{k}.svg').write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="1200" height="400" role="img" aria-label="{html.escape(t)}">
<rect width="1200" height="400" fill="{bg}"/><rect x="760" y="-60" width="520" height="520" fill="{acc}" transform="rotate(14 1000 200)"/>
<g transform="translate(790 20)">{g}</g>
<rect x="60" y="300" width="120" height="16" fill="{acc if bg != OR else INK}"/></svg>''')
print('market svgs:', len(list(out.glob('*.svg'))))

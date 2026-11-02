"""Local SVG logo-style covers for ai-tools.html (name + monogram in each tool's colour; no third-party logos hotlinked).
Reads the aiTools list from js/data.js. usage: python3 tools/ai_covers.py → assets/img/ai/<id>.svg"""
import pathlib, re, html, json, subprocess
root = pathlib.Path(__file__).resolve().parent.parent; out = root / 'assets/img/ai'; out.mkdir(parents=True, exist_ok=True)
tools = json.loads(subprocess.check_output(['node', '-e', "global.window={};require('./js/data.js');console.log(JSON.stringify(window.CC_DATA.aiTools.map(t=>({id:t.id,name:t.name,mono:t.mono,bg:t.bg,fg:t.fg}))))"], cwd=root))
for t in tools:
    n = html.escape(t['name']); m = html.escape(t['mono']); fs = 40 if len(t['name']) <= 12 else 30 if len(t['name']) <= 20 else 24
    (out / f"{t['id']}.svg").write_text(f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 300" width="640" height="300" role="img" aria-label="{n}">
<defs><pattern id="p" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="11" height="22" fill="#ffffff" opacity=".05"/></pattern></defs>
<rect width="640" height="300" fill="#0B1236"/><rect width="640" height="300" fill="url(#p)"/>
<rect x="40" y="70" width="160" height="160" fill="{t['bg']}" stroke="#ffffff" stroke-width="6"/>
<rect x="52" y="82" width="160" height="160" fill="none" stroke="#fc8c0c" stroke-width="4" opacity=".9"/>
<text x="120" y="{150 + 22}" text-anchor="middle" font-family="Archivo Black, Impact, Arial Black, sans-serif" font-size="{64 if len(t['mono']) <= 2 else 48}" fill="{t['fg']}">{m}</text>
<text x="236" y="160" font-family="Archivo Black, Impact, Arial Black, sans-serif" font-size="{fs}" fill="#ffffff">{n}</text>
<rect x="236" y="182" width="90" height="10" fill="#05e6f2"/>
<text x="236" y="226" font-family="Barlow, Arial, sans-serif" font-weight="700" font-size="18" letter-spacing="3" fill="#dfe5ea">FREE AI · 101 PICK</text>
</svg>''')
print('wrote', len(tools), 'covers')

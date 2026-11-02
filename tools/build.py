"""Static include step (no runtime build): expands {{...}} placeholders in src/*.html into the root *.html files.
Placeholders: {{ICONS}} {{SCRIPTS}} {{HEAD title=".." desc=".." path=".." [jsonld=".."] [charts]}}
              {{SIDEBAR role="admin|tutor|learner" active=".."}} {{TOPBAR role=".." name=".." label=".."}} {{FOOTER}}
"""
import pathlib, re, html, json
root = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://101codecrafts.github.io/members-site"   # canonical base; change when the domain is live
icons = (root / 'src/icons.svg').read_text()

LIBS = [  # jsDelivr + SRI (sha384 computed from the exact files)
    ("https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js", "sha384-HOvlOYPIs/zjoIkWUGXkVmXsjr8GuZLV+Q+rcPwmJOVZVpvTSXQChiN4t9Euv9Vc"),
    ("https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js", "sha384-P8VzCVnT9NBUkMrpcIZrJbA7EBjJvh/fJS6PmP+4nLIM284DtsImIv8D0fFjIkeh"),
    ("https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/SplitText.min.js", "sha384-xb96EMJeax+NLXMC88ZBa1xAeAW+kn+horHh/zFlbMLG2UPWhMJJSlv7fi57hS+Q"),
    ("https://cdn.jsdelivr.net/npm/lenis@1.3.4/dist/lenis.min.js", "sha384-FKTX0CNJ8ngN1oGMBReVu7mvjTJyjFiD5etb1NKnYxc+8eFI2O0KWnksTN+oTFcu"),
]
CHART = ("https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js", "sha384-Sse/HDqcypGpyTDpvZOJNnG0TT3feGQUkF9H+mnRvic+LjR+K1NhTt8f51KIQ3v3")

def attrs(s):
    return dict(re.findall(r'(\w+)="([^"]*)"', s)) | {k: True for k in re.findall(r'\b(\w+)\b(?!=)', re.sub(r'\w+="[^"]*"', '', s))}

ORG_LD = {"@context": "https://schema.org", "@type": "Organization", "name": "101 Codecrafts", "url": SITE + "/", "logo": SITE + "/assets/icons/icon-512.png",
          "slogan": "Start at 101. Craft your way up.", "sameAs": ["https://github.com/101codecrafts"]}

EARLY = '''<script>/* early: lite/data-saver + theme before first paint */(function(d){try{var c=navigator.connection;if(localStorage.lite==="1"||(c&&c.saveData&&localStorage.lite!=="0"))d.classList.add("lite");if(/[?&]static/.test(location.search))d.classList.add("static");else if(localStorage.theme==="dark")d.dataset.theme="dark";}catch(e){}})(document.documentElement)</script>'''

def head(a, page):
    t = a.get('title', '101 Codecrafts'); d = a.get('desc', '101 Codecrafts: learn, build and collaborate in tech.'); p = a.get('path', page)
    url = SITE + '/' + ('' if p == 'index.html' else p)
    og = a.get('og', 'assets/og/og-default.png')
    ld = [ORG_LD]
    if a.get('jsonld'): ld += json.loads((root / 'src/jsonld' / a['jsonld']).read_text())
    noindex = '<meta name="robots" content="noindex">\n' if a.get('noindex') else ''
    return f'''<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(t)}</title>
<meta name="description" content="{html.escape(d)}">
{noindex}<link rel="canonical" href="{url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="101 Codecrafts">
<meta property="og:title" content="{html.escape(t)}"><meta property="og:description" content="{html.escape(d)}">
<meta property="og:url" content="{url}"><meta property="og:image" content="{SITE}/{og}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{SITE}/{og}">
<meta name="theme-color" content="#0B1236">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="assets/icons/favicon-32.png" sizes="32x32"><link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preload" href="assets/fonts/archivo-black-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="assets/fonts/barlow-500.woff2" as="font" type="font/woff2" crossorigin>
{EARLY}
<script type="application/ld+json">{json.dumps(ld if len(ld) > 1 else ld[0])}</script>'''

def scripts(charts=False):
    tags = ['<script src="js/data.js" defer></script>', '<script src="js/api.js" defer></script>']
    libs = LIBS + ([CHART] if charts else [])
    tags += [f'<script src="{u}" integrity="{h}" crossorigin="anonymous" defer></script>' for u, h in libs]
    tags += ['<script src="js/ui.js" defer></script>', '<script src="js/motion.js" defer></script>']
    return '\n'.join(tags)

NAV = {
 'learner': [("Home", "home", "dashboard.html"), ("Community", "users", "profile.html"), ("Learning", "learning", "courses.html"), ("Projects", "code", "projects.html"), ("Launchpad", "trophy", "launchpad.html"), ("Testing", "clipboard", "testing.html"), ("Competitions", "star", "competitions.html"), ("Groups", "people", "groups.html"), ("Library", "folder", "resources.html"), ("Daily News", "doc", "news.html"), ("Marketplace", "store", "#"), ("Events", "calendar", "competitions.html"), ("Messages", "chat", "#", 3), ("Notifications", "bell", "#", 5)],
 'tutor': [("Overview", "home", "tutor.html"), ("My Courses", "cap", "tutor.html#courses"), ("My Learners", "users", "tutor.html#learners"), ("Sessions", "calendar", "tutor.html#sessions"), ("Earnings & Payouts", "cash", "tutor.html#earnings"), ("Courses", "learning", "courses.html"), ("Library", "folder", "resources.html"), ("Daily News", "doc", "news.html"), ("Messages", "chat", "#", 2), ("Settings", "gear", "#")],
 'admin': [("Overview", "home", "admin.html"), ("Analytics", "chart", "admin.html#analytics"), ("Members", "users", "admin.html#users"), ("Learners", "cap", "admin.html#users"), ("Tutors", "teacher", "admin.html#users"), ("Approvals", "clipboard", "admin.html#approvals", 17), ("Courses & Paths", "learning", "admin.html#courses"), ("Projects", "code", "#"), ("Tools/Software", "toolbox", "#"), ("Library", "folder", "admin.html#add-resource"), ("Events", "calendar", "admin.html#events"), ("Marketplace", "store", "#"), ("Payments & Payouts", "cash", "admin.html#payments"), ("Messages", "chat", "#", 4), ("Reports", "report", "admin.html#moderation"), ("Audit Log", "list", "admin.html#audit"), ("Settings", "gear", "admin.html#settings")],
}

def sidebar(a):
    role = a.get('role', 'learner'); act = a.get('active', '')
    items = ''.join(f'<a href="{h}"{" aria-current=page" if n == act else ""}><svg aria-hidden="true"><use href="#i-{i}"/></svg><span>{n}</span>{f"<i class=badge>{b[0]}</i>" if b else ""}</a>' for n, i, h, *b in NAV[role])
    return f'''<aside class="sbar" aria-label="Main navigation">
  <a class="logo" href="index.html"><img src="assets/img/logo-101-sidebar.webp" srcset="assets/img/logo-101-sidebar.webp 1x, assets/img/logo-101-sidebar@3x.webp 3x" alt="101 Codecrafts home" width="82" height="46"><div><b>101<br>Codecrafts</b><small>Build. Learn. Grow.</small></div></a>
  <nav>{items}</nav>
  <hr><a class="btn or side-extra" href="https://chat.whatsapp.com/" target="_blank" rel="noopener noreferrer" style="width:100%"><svg aria-hidden="true"><use href="#i-wa"/></svg>WhatsApp community</a>
</aside>'''

def topbar(a):
    role = a.get('role', 'learner'); name = a.get('name', 'Cavendish Cuu'); label = a.get('label', role.title())
    tabs = ''.join(f'<a href="{h}"{" aria-current=page" if r == role else ""}>{r.title()}</a>' for r, h in [("learner", "dashboard.html"), ("tutor", "tutor.html"), ("admin", "admin.html")])
    initials = ''.join(w[0] for w in name.split()[:2])
    return f'''<header class="topbar">
  <label class="search"><svg aria-hidden="true"><use href="#i-search"/></svg><span class="sr-only">Search</span><input type="search" placeholder="Search courses, projects, people, or resources..."></label>
  <span class="sp"></span>
  <nav class="role-tabs" aria-label="Switch role view">{tabs}</nav>
  <a class="ib" href="#" aria-label="Notifications"><svg aria-hidden="true"><use href="#i-bell"/></svg><i class="dot"></i></a>
  <a class="ib" href="#" aria-label="Messages"><svg aria-hidden="true"><use href="#i-msg"/></svg></a>
  <div class="chip-me"><span class="av" aria-hidden="true">{initials}</span><div><b>{name}</b><small>{label}</small></div></div>
</header>'''

FOOTER = '''<footer class="flow-foot">
  <span>© 2025 101 Codecrafts. All rights reserved.</span>
  <nav aria-label="Footer"><a href="index.html">Home</a><a href="courses.html">Learn</a><a href="news.html">News</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="verify.html">Verify a certificate</a></nav>
  <div class="socials" data-socials><a href="#" aria-label="YouTube"><svg><use href="#i-yt"/></svg></a><a href="#" aria-label="Instagram"><svg><use href="#i-ig"/></svg></a><a href="#" aria-label="TikTok"><svg><use href="#i-tt"/></svg></a><a href="#" aria-label="X"><svg><use href="#i-x"/></svg></a><a href="#" aria-label="LinkedIn"><svg><use href="#i-in"/></svg></a><a href="#" aria-label="Discord"><svg><use href="#i-discord"/></svg></a></div>
</footer>'''

# CSS bundles (fewer render-blocking requests; sources stay in css/*.css)
def bundle(name, parts):
    out = '/* GENERATED bundle: ' + ' + '.join(parts) + ' — edit the sources, then run tools/build.py */\n'
    out += '\n'.join((root / 'css' / p).read_text().replace('url(../assets', 'url(../assets') for p in parts)
    (root / 'css' / name).write_text(out)
bundle('bundle-app.css', ['tokens.css', 'brutal.css', 'app.css'])
bundle('bundle-dashboard.css', ['tokens.css', 'brutal.css', 'app.css', 'dashboard.css'])
bundle('bundle-landing.css', ['tokens.css', 'brutal.css', 'app.css', 'landing.css'])
CSS_LINKS = {
    'dashboard': '<link rel="stylesheet" href="css/bundle-dashboard.css">',
    'landing': '<link rel="stylesheet" href="css/bundle-landing.css">',
    'app': '<link rel="stylesheet" href="css/bundle-app.css">',
}
import re as _re
def css_links(s):
    if 'href="css/dashboard.css"' in s: k = 'dashboard'
    elif 'href="css/landing.css"' in s: k = 'landing'
    else: k = 'app'
    s = _re.sub(r'<link rel="stylesheet" href="css/(brutal|app|dashboard|landing)\.css">\n?', '', s)
    return s.replace('{{CSS}}', CSS_LINKS[k]) if '{{CSS}}' in s else s.replace('</head>', CSS_LINKS[k] + '\n</head>', 1) if 'id="fitcss"' not in s else s.replace('<link rel="stylesheet" id="fitcss"', CSS_LINKS[k] + '\n<link rel="stylesheet" id="fitcss"', 1)

for f in (root / 'src').glob('*.html'):
    s = css_links(f.read_text()); name = f.name
    charts = 'data-charts' in s
    s = s.replace('{{ICONS}}', icons).replace('{{SCRIPTS}}', scripts(charts)).replace('{{FOOTER}}', FOOTER)
    s = re.sub(r'\{\{HEAD(.*?)\}\}', lambda m: head(attrs(m.group(1)), name), s, flags=re.S)
    s = re.sub(r'\{\{SIDEBAR(.*?)\}\}', lambda m: sidebar(attrs(m.group(1))), s)
    s = re.sub(r'\{\{TOPBAR(.*?)\}\}', lambda m: topbar(attrs(m.group(1))), s)
    (root / name).write_text(s)
print('built', len(list((root / 'src').glob('*.html'))), 'pages')

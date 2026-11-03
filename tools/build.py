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

EARLY = '''<script>/* early: lite/data-saver + theme before first paint (stored choice, else the system setting; never in ?static) */(function(d){try{var c=navigator.connection;if(localStorage.lite==="1"||(c&&c.saveData&&localStorage.lite!=="0"))d.classList.add("lite");if(/[?&]static/.test(location.search))d.classList.add("static");else{var t=localStorage.theme;if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches)){d.dataset.theme="dark";d.style.colorScheme="dark"}if(localStorage["cc.sidebar"]==="collapsed")d.classList.add("sb-collapsed");}}catch(e){}})(document.documentElement)</script>'''

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
    tags = ['<script src="js/data.js" defer></script>', '<script src="js/site-stats.js" defer></script>', '<script src="js/api.js" defer></script>', '<script src="js/auth.js" defer></script>', '<script src="js/share.js" defer></script>']
    libs = LIBS + ([CHART] if charts else [])
    tags += [f'<script src="{u}" integrity="{h}" crossorigin="anonymous" defer></script>' for u, h in libs]
    tags += ['<script src="js/shell.js" defer></script>', '<script src="js/ui.js" defer></script>', '<script src="js/motion.js" defer></script>', '<script src="js/era.js" defer></script>', '<script src="js/ads.js" defer></script>']
    return '\n'.join(tags)

# Sidebar navigation. A tuple is (label, icon, href); a str starts a section ("" = no heading).
NAV = {
 'learner': ["", ("Home", "home", "dashboard.html"), ("Community", "users", "profile.html"), ("Notifications", "bell", "announcements.html"),
             "Learn", ("Learning", "learning", "courses.html"), ("Learn", "openbook", "learn.html"), ("Practice", "codebox", "practice.html"), ("AI Tools", "brain", "ai-tools.html"),
             "Build", ("Projects", "code", "projects.html"), ("Launchpad", "trophy", "launchpad.html"), ("Testing", "clipboard", "testing.html"), ("Competitions", "star", "competitions.html"),
             "Community", ("Groups", "people", "groups.html"), ("Events & Meetups", "calendar", "events.html"), ("Marketplace", "store", "marketplace.html"),
             "Stay updated", ("Daily News", "doc", "news.html"), ("Opportunities", "briefcase", "opportunities.html"), ("Announcements", "megaphone", "announcements.html"), ("Library", "folder", "resources.html"),
             "Your space", ("My Courses", "cap", "courses.html#c101"), ("My Projects", "codebox", "projects.html"), ("My Downloads", "download", "resources.html"), ("My Profile", "user", "profile.html"), ("Member card", "badge", "card.html"), ("Settings", "gear", "settings-apps.html")],
 'tutor': ["Teach", ("Overview", "home", "tutor.html"), ("My Courses", "cap", "tutor.html#courses"), ("My Learners", "users", "tutor.html#learners"), ("Sessions", "calendar", "sessions.html"), ("Earnings & Payouts", "cash", "tutor.html#earnings"),
           "Explore", ("Courses", "learning", "courses.html"), ("Learn", "openbook", "learn.html"), ("Practice", "codebox", "practice.html"), ("AI Tools", "brain", "ai-tools.html"), ("Library", "folder", "resources.html"),
           "Stay updated", ("Daily News", "doc", "news.html"), ("Opportunities", "briefcase", "opportunities.html"), ("Events & Meetups", "calendar", "events.html"), ("Marketplace", "store", "marketplace.html"),
           "Your space", ("Member card", "badge", "card.html"), ("Settings", "gear", "settings-apps.html")],
 'admin': ["Overview", ("Overview", "home", "admin.html"), ("Analytics", "chart", "admin.html#analytics"),
           "People", ("Members", "users", "admin.html#users"), ("Learners", "cap", "admin.html#users"), ("Tutors", "teacher", "admin.html#users"), ("Approvals", "clipboard", "admin.html#approvals"),
           "Content", ("Courses & Paths", "learning", "admin.html#courses"), ("Projects", "code", "projects.html"), ("Tools/Software", "toolbox", "ai-tools.html"), ("Library", "folder", "admin.html#add-resource"), ("Announcements", "megaphone", "admin.html#announcements"), ("Opportunity review", "briefcase", "admin.html#opp-queue"), ("Events", "calendar", "admin.html#events"),
           "Money", ("Marketplace", "store", "marketplace.html"), ("Payments & Payouts", "cash", "admin.html#payments"),
           "System", ("Reports", "report", "admin.html#moderation"), ("Audit Log", "list", "admin.html#audit"), ("Settings", "gear", "admin.html#settings")],
}

# TODO(founder): paste the real WhatsApp community invite (https://chat.whatsapp.com/<code>) here, then re-run tools/build.py.
# While it is empty the sidebar shows no WhatsApp link at all (an invite URL without a code only opens a dead page).
WA_INVITE = ""
def wa_foot():
    if not re.match(r'^https://chat\.whatsapp\.com/[A-Za-z0-9]{10,}$', WA_INVITE): return '<!-- WhatsApp community link hidden until WA_INVITE is set in tools/build.py -->'
    return f'<div class="sb-foot"><a class="sb-wa" href="{WA_INVITE}" target="_blank" rel="noopener noreferrer"><svg aria-hidden="true"><use href="#i-wa"/></svg><span>WhatsApp community</span></a></div>'

def sidebar(a):
    """App-shell sidebar (js/shell.js + css/shell.css): full width or a 72px icon rail at >=1024px, off-canvas drawer below."""
    role = a.get('role', 'learner'); act = html.unescape(a.get('active', ''))
    secs, cur = [], None
    for it in NAV[role]:
        if isinstance(it, str):
            cur = [it, []]; secs.append(cur); continue
        n, i, h = it
        cur[1].append(f'<a href="{h}"{" aria-current=page" if n == act else ""}><svg aria-hidden="true"><use href="#i-{i}"/></svg><span>{html.escape(n)}</span></a>')
    nav = ''.join('<div class="sb-sec">' + (f'<h2 class="sb-h">{html.escape(t)}</h2>' if t else '') + ''.join(links) + '</div>' for t, links in secs)
    return f'''<div class="sbar" id="sbar">
  <div class="sb-head">
    <a class="sb-logo" href="index.html"><img src="assets/img/logo-101-sidebar.webp" srcset="assets/img/logo-101-sidebar.webp 1x, assets/img/logo-101-sidebar@3x.webp 3x" alt="" width="57" height="32"><span class="sb-word"><b>101 Codecrafts</b><small>Build. Learn. Grow.</small></span><span class="sr-only">101 Codecrafts home</span></a>
    <button type="button" class="sb-toggle" data-sb-toggle aria-controls="sbar" aria-expanded="true" aria-label="Collapse sidebar"><svg aria-hidden="true"><use href="#i-panel"/></svg></button>
  </div>
  <nav class="sb-nav" aria-label="Main">{nav}</nav>
  {wa_foot()}
</div>
<div class="sb-scrim" data-sb-scrim hidden></div>'''

def topbar(a, page=''):
    """Navy top bar. The account area is a skeleton until js/auth.js resolves the session: no hard-coded names."""
    roles = ''.join(f'<a role="menuitem" href="{h}">{r}</a>' for r, h in [("Learner", "dashboard.html"), ("Tutor", "tutor.html"), ("Admin", "admin.html")])
    name = a.get('name', 'Guest')  # default display name (ui/pages); the live account chip is filled by js/auth.js
    return f'''<header class="topbar">
  <button type="button" class="tb-nav" data-sb-open aria-controls="sbar" aria-expanded="false" aria-label="Open menu"><svg class="ic-menu" aria-hidden="true"><use href="#i-menu"/></svg><svg class="ic-panel" aria-hidden="true"><use href="#i-panel"/></svg></button>
  <a class="tb-brand" href="index.html"><img src="assets/img/logo-101-sidebar.webp" srcset="assets/img/logo-101-sidebar.webp 1x, assets/img/logo-101-sidebar@3x.webp 3x" alt="" width="50" height="28"><b>101 Codecrafts</b><span class="sr-only">home</span></a>
  <label class="tb-search"><svg aria-hidden="true"><use href="#i-search"/></svg><span class="sr-only">Search</span><input type="search" placeholder="Search courses, projects, people…"><kbd aria-hidden="true">/</kbd></label>
  <nav class="top-links" aria-label="Quick links">{''.join(f'<a href="{h}"{" aria-current=page" if h == page else ""}>{t}</a>' for t, h in [("News", "news.html"), ("Opportunities", "opportunities.html"), ("Events", "events.html")])}</nav>
  <span class="sp"></span>
  <button type="button" class="ib tb-search-btn" data-search aria-label="Search"><svg aria-hidden="true"><use href="#i-search"/></svg></button>
  <a class="ib tb-bell" href="announcements.html" aria-label="Notifications"><svg aria-hidden="true"><use href="#i-bell"/></svg><i class="dot"></i></a>
  <div class="acct" data-acct aria-busy="true">
    <span class="acct-sk" aria-hidden="true"><i></i><b></b></span><span class="sr-only acct-loading">Loading account</span>
    <div class="acct-guest" hidden><span class="acct-av is-guest" aria-hidden="true"><svg><use href="#i-user"/></svg></span><a class="tb-btn ghost" href="signin.html">Sign in</a><a class="tb-btn cta" href="signup.html">Join</a></div>
    <div class="acct-user" hidden>
      <button type="button" class="acct-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="acct-menu"><span class="acct-av" aria-hidden="true"></span><span class="acct-id"><b class="acct-name"></b><small class="acct-role">Member</small></span><svg class="acct-chev" aria-hidden="true"><use href="#i-chev"/></svg><span class="sr-only">account menu</span></button>
      <div class="acct-menu" id="acct-menu" role="menu" aria-label="Account" hidden>
        <div class="am-head" role="none"><b class="acct-name"></b><small class="acct-email"></small></div>
        <a role="menuitem" href="profile.html"><svg aria-hidden="true"><use href="#i-user"/></svg>Profile</a>
        <a role="menuitem" href="settings-apps.html"><svg aria-hidden="true"><use href="#i-gear"/></svg>Settings</a>
        <div class="role-tabs am-roles" role="group" aria-label="Switch role"><span class="am-label" aria-hidden="true">Switch role</span>{roles}</div>
        <button type="button" role="menuitem" class="am-out" data-signout><svg aria-hidden="true"><use href="#i-logout"/></svg>Sign out</button>
      </div>
    </div>
  </div>
</header>'''

FOOTER = '''<footer class="flow-foot">
  <p class="ft-tag">Start at 101. <b>Craft your way up.</b></p>
  <span>© <span data-year>2026</span> 101 Codecrafts. All rights reserved.</span>
  <nav aria-label="Footer"><a href="index.html">Home</a><a href="about.html">About</a><a href="community.html">Community</a><a href="courses.html">Learn</a><a href="ai-tools.html">AI Tools</a><a href="news.html">News</a><a href="opportunities.html">Opportunities</a><a href="events.html">Events</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a><a href="verify.html">Verify a certificate</a></nav>
  <div class="socials" data-socials><a href="https://github.com/101codecrafts" target="_blank" rel="noopener noreferrer" aria-label="101 Codecrafts on GitHub"><svg><use href="#i-gh"/></svg></a></div>
</footer>'''

# CSS bundles (fewer render-blocking requests; sources stay in css/*.css)
def bundle(name, parts):
    out = '/* GENERATED bundle: ' + ' + '.join(parts) + ' — edit the sources, then run tools/build.py */\n'
    out += '\n'.join((root / 'css' / p).read_text().replace('url(../assets', 'url(../assets') for p in parts)
    (root / 'css' / name).write_text(out)
import theme as _theme; _theme.build()   # css/theme-dark.css: dark role mapping generated from the component sources
bundle('bundle-theme.css', ['theme-dark.css', 'theme.css'])   # loaded LAST on every page (see THEME_LINK)
bundle('bundle-app.css', ['tokens.css', 'brutal.css', 'app.css', 'type.css', 'system.css', 'shell.css', 'touch.css', 'era.css'])
bundle('bundle-dashboard.css', ['tokens.css', 'brutal.css', 'app.css', 'type.css', 'dashboard.css', 'system.css', 'shell.css', 'activity.css', 'touch.css', 'era.css'])
bundle('bundle-landing.css', ['tokens.css', 'brutal.css', 'app.css', 'type.css', 'landing.css', 'system.css', 'shell.css', 'touch.css', 'era.css'])
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


# Pages served at nested URLs (/go/<id>, /u/<handle>, any missing path -> 404.html) mark <body data-abs>: their relative
# asset and page URLs are written root-absolute so CSS, fonts, logos and links resolve at any depth.
_SKIP = ('/', '#', 'http:', 'https:', 'data:', 'mailto:', 'tel:', 'javascript:', 'blob:', '{')
def _abs1(u):
    u = u.strip()
    return u if not u or u.startswith(_SKIP) else '/' + (u[2:] if u.startswith('./') else u)
def rootabs(s):
    s = re.sub(r'(\s(?:href|src|action|poster)=")([^"]*)"', lambda m: m.group(1) + _abs1(m.group(2)) + '"', s)
    return re.sub(r'(\ssrcset=")([^"]*)"', lambda m: m.group(1) + ', '.join(' '.join([_abs1(x.split()[0])] + x.split()[1:]) for x in m.group(2).split(',') if x.strip()) + '"', s)

THEME_LINK = '<link rel="stylesheet" href="css/bundle-theme.css">'
for f in (root / 'src').glob('*.html'):
    s = css_links(f.read_text()); name = f.name
    s = s.replace('</head>', THEME_LINK + '\n</head>', 1) if THEME_LINK not in s else s
    charts = 'data-charts' in s
    s = s.replace('{{ICONS}}', icons).replace('{{SCRIPTS}}', scripts(charts)).replace('{{FOOTER}}', FOOTER)
    s = re.sub(r'\{\{HEAD(.*?)\}\}', lambda m: head(attrs(m.group(1)), name), s, flags=re.S)
    s = re.sub(r'\{\{SIDEBAR(.*?)\}\}', lambda m: sidebar(attrs(m.group(1))), s)
    s = re.sub(r'\{\{TOPBAR(.*?)\}\}', lambda m: topbar(attrs(m.group(1)), name), s)
    if 'data-abs' in s: s = rootabs(s)
    (root / name).write_text(s)
print('built', len(list((root / 'src').glob('*.html'))), 'pages')

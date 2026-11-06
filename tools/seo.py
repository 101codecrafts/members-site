"""r13 seo: search + AI-search metadata for the static build (imported by tools/build.py).

One place decides, for every page:
  - the canonical origin (SITE): env SITE_URL, else src/data/site.json "site_url" (a .invalid placeholder until the
    domain is live; the combined deploy rewrites the placeholder from its own SITE_URL env, see docs/SEO.md)
  - whether it may be indexed: only when it is public to a signed-out visitor (src/data/access-policy.json "pages" gate),
    its {{HEAD}} has no `noindex`, it is not listed in site.json "noindex_pages", and it does not carry the legal DRAFT
    banner. Everything else gets <meta name="robots" content="noindex">.
  - the head tags (title, description, robots, canonical, Open Graph, Twitter card) and ONE JSON-LD @graph:
    Organization + WebSite on every page, WebPage + BreadcrumbList on indexable pages, plus data read from the VISIBLE
    page (FAQPage from <details><summary> inside a *faq* section; ItemList of Course from the landing's path cards).
    Nothing is invented: structured data only repeats what the page shows (Google structured data policies).
  - sitemap.xml, robots.txt and llms.txt, generated from the indexable set (never hand-edited).
"""
import html, json, os, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent
CFG = json.loads((root / 'src/data/site.json').read_text())
PLACEHOLDER = CFG['placeholder']
SITE = (os.environ.get('SITE_URL') or CFG['site_url']).rstrip('/')
NAME, ALT = CFG['name'], CFG['alternate_names']
POLICY = json.loads((root / 'src/data/access-policy.json').read_text())

def gated(page):
    """True when a signed-out visitor (and so a crawler) is redirected away from the page."""
    act = POLICY['pages'].get(page.removesuffix('.html'))
    return bool(act) and 'visitor' not in POLICY['actions'].get(act, {}).get('roles', [])

def indexable(page, a, body=''):
    # draft legal pages (r12 legal banner "DRAFT — review by a qualified Ugandan advocate…") stay out of search until signed off
    return (not a.get('noindex') and not gated(page) and page not in CFG.get('noindex_pages', [])
            and CFG['draft_marker'] not in body)

def url_for(p):
    return SITE + '/' + ('' if p == 'index.html' else p)

def short_title(t):
    """'Daily Tech News · 101 Codecrafts' -> 'Daily Tech News' (breadcrumb name, llms.txt link text)."""
    return re.split(r'\s+[·|]\s+', t)[0].strip()

ORG_ID, SITE_ID = SITE + '/#org', SITE + '/#website'

def org(social_live, full=None):
    o = {"@type": "Organization", "@id": ORG_ID, "name": NAME, "alternateName": ALT, "url": SITE + "/",
         "logo": {"@type": "ImageObject", "url": SITE + "/assets/icons/icon-512.png", "width": 512, "height": 512},
         "slogan": CFG['slogan']}
    if social_live: o["sameAs"] = social_live
    if full: o |= {k: v for k, v in full.items() if k not in ('@context', '@type', '@id', 'name', 'url', 'logo', 'slogan', 'sameAs')}
    return o

def website():
    # No SearchAction: Google retired the sitelinks search box (21 Nov 2024) and 101 has no public, crawlable search URL.
    return {"@type": "WebSite", "@id": SITE_ID, "name": NAME, "alternateName": ALT, "url": SITE + "/",
            "inLanguage": "en", "publisher": {"@id": ORG_ID}}

# ---------- data read from the visible page ----------
_TAG = re.compile(r'<[^>]+>')
def text(s): return re.sub(r'\s+', ' ', html.unescape(_TAG.sub(' ', s))).strip()

def faqs(body):
    """Question/answer pairs from <details><summary>Q</summary>A</details> inside the first element whose class or id names faq."""
    out = []
    for m in re.finditer(r'<(?:section|div)\b[^>]*\s(?:class|id)="[^"]*faq[^"]*"[^>]*>', body, re.I):
        for d in re.finditer(r'<details\b[^>]*>\s*<summary\b[^>]*>(.*?)</summary>(.*?)</details>', body[m.end():], re.S):
            q, a = text(d.group(1)), text(d.group(2))
            if q and a and (q, a) not in out: out.append((q, a))
        if out: break
    return out

def path_cards(body):
    """Landing 'learning paths' cards: <article class="... e-pcard ..."><h3 ...>Name</h3><p ...>Text</p>."""
    out = []
    for m in re.finditer(r'<article\b[^>]*class="[^"]*\be-pcard\b[^"]*"[^>]*>(.*?)</article>', body, re.S):
        h = re.search(r'<h3\b[^>]*>(.*?)</h3>', m.group(1), re.S); p = re.search(r'<p\b[^>]*>(.*?)</p>', m.group(1), re.S)
        if h and p: out.append((text(h.group(1)), text(p.group(1))))
    return out

def graph(page, a, title, desc, body, social_live, extra=(), full_org=None):
    g = [org(social_live, full_org), website()]
    if indexable(page, a, body):
        url = url_for(a.get('path', page))
        wp = {"@type": "AboutPage" if page == 'about.html' else "WebPage", "@id": url + "#webpage", "url": url, "name": title,
              "description": desc, "isPartOf": {"@id": SITE_ID}, "about": {"@id": ORG_ID}, "inLanguage": "en"}
        g.append(wp)
        if page != 'index.html':
            bc = {"@type": "BreadcrumbList", "@id": url + "#breadcrumb", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
                {"@type": "ListItem", "position": 2, "name": short_title(title), "item": url}]}
            wp["breadcrumb"] = {"@id": bc["@id"]}; g.append(bc)
        qa = faqs(body)
        if qa:
            g.append({"@type": "FAQPage", "@id": url + "#faq", "isPartOf": {"@id": url + "#webpage"}, "mainEntity": [
                {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": ans}} for q, ans in qa]})
        if page == 'index.html':
            cards = path_cards(body)
            if len(cards) >= 3:
                g.append({"@type": "ItemList", "@id": url + "#paths", "name": "Popular learning paths", "itemListElement": [
                    {"@type": "ListItem", "position": i + 1, "item": {"@type": "Course", "name": n, "description": d,
                     "provider": {"@type": "Organization", "name": NAME, "@id": ORG_ID}}} for i, (n, d) in enumerate(cards)]})
    for x in extra:   # page-specific blocks from src/jsonld/<file> (must describe visible content)
        x = dict(x); x.pop('@context', None); g.append(x)
    return {"@context": "https://schema.org", "@graph": g}

def head_tags(page, a, title, desc, og, body=''):
    url = url_for(a.get('path', page)); img = SITE + '/' + og
    robots = 'index, follow, max-image-preview:large' if indexable(page, a, body) else 'noindex'
    e = html.escape
    return (f'<title>{e(title)}</title>\n<meta name="description" content="{e(desc)}">\n'
            f'<meta name="robots" content="{robots}">\n<link rel="canonical" href="{url}">\n'
            f'<meta property="og:type" content="website"><meta property="og:site_name" content="{NAME}"><meta property="og:locale" content="en_UG">\n'
            f'<meta property="og:title" content="{e(title)}"><meta property="og:description" content="{e(desc)}">\n'
            f'<meta property="og:url" content="{url}"><meta property="og:image" content="{img}">'
            f'<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="{e(CFG["og_alt"])}">\n'
            f'<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{e(title)}">'
            f'<meta name="twitter:description" content="{e(desc)}"><meta name="twitter:image" content="{img}">')

# ---------- site files ----------
def write_site_files(pages):
    """pages: [(file, title, desc)] for every indexable page."""
    order = {p: i for i, p in enumerate(CFG['sitemap_order'])}
    pages = sorted(pages, key=lambda x: (order.get(x[0], 99), x[0]))
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<!-- GENERATED by tools/build.py (tools/seo.py): public, indexable pages only -->',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sm += [f'  <url><loc>{url_for(p)}</loc></url>' for p, _, _ in pages]
    (root / 'sitemap.xml').write_text('\n'.join(sm + ['</urlset>']) + '\n')
    rb = ['# GENERATED by tools/build.py (tools/seo.py). Signed-in pages are not blocked here on purpose: they carry',
          '# <meta name="robots" content="noindex">, which a crawler can only read if it may fetch the page.',
          '# Preview and *.vercel.app hosts also send X-Robots-Tag: noindex (vercel.json; backend next.config.mjs).',
          'User-agent: *', 'Allow: /', 'Disallow: /api/', 'Disallow: /go/', '', f'Sitemap: {SITE}/sitemap.xml']
    (root / 'robots.txt').write_text('\n'.join(rb) + '\n')
    ll = [f'# {NAME}', '', f'> {CFG["llms_summary"]}', '', CFG['llms_note'], '', '## Main pages', '']
    ll += [f'- [{short_title(t)}]({url_for(p)}): {d}' for p, t, d in pages if p not in CFG['llms_optional']]
    opt = [f'- [{short_title(t)}]({url_for(p)}): {d}' for p, t, d in pages if p in CFG['llms_optional']]
    if opt: ll += ['', '## Optional', ''] + opt
    (root / 'llms.txt').write_text('\n'.join(ll) + '\n')

"""Dark-theme role mapper (run by tools/build.py; no runtime build).

Reads every component stylesheet in cascade order and writes css/theme-dark.css: for each declaration that paints a colour
(text, fill, background, border, outline, shadow) it emits the same selector, scoped `:where([data-theme=dark])` so
specificity is unchanged, with the colour replaced by a ROLE TOKEN from css/theme.css:
  text-ish   dark ink/navy -> var(--text), mid greys -> var(--text-muted), orange/cyan/link text -> their dark-safe roles
  background white/near-white -> var(--surface-1|2|3), light tints -> dark tints, navy fills -> var(--fill-inverse)
  border     ink/navy -> var(--border-strong), light hairlines -> var(--border-subtle)
  shadow     ink/navy offset shadows -> var(--shadow-ink)
Text that sits on an accent fill in the same rule keeps its on-accent colour. Tokens that css/theme.css already flips
(var(--surface), var(--bg), var(--mut), ...) are left alone. Light mode is untouched: every rule is dark-scoped.
Hand-tuned exceptions live in css/theme.css (loaded after this file), never here.
"""
import re, colorsys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
ORDER = ['brutal.css', 'app.css', 'type.css', 'dashboard.css', 'landing.css', 'system.css', 'shell.css',
         'feed.css', 'market.css', 'practice.css', 'pages.css', 'auth.css', 'sessions.css', 'go.css']

# tokens css/theme.css redefines for dark: declarations that only use these need no override
AUTO = {'--bg', '--line', '--mut', '--blue', '--color-page', '--color-page-landing', '--color-surface', '--color-surface-2', '--color-line',
        '--color-muted', '--color-link', '--color-orange-text', '--color-orange-text-large', '--color-cyan-text', '--surface', '--surface-alt',
        '--surface-sunk', '--surface-inv', '--ink-muted', '--accent-ink', '--accent-2-ink', '--link', '--hairline', '--border-c', '--border',
        '--shadow', '--shadow-brutal', '--shadow-brutal-sm', '--border-brutal', '--border-thin', '--text', '--text-muted', '--surface-1',
        '--surface-2', '--surface-3', '--border-subtle', '--border-strong', '--fill-inverse', '--shadow-ink', '--accent-text'}
SHELL = re.compile(r'^--sh-')
FLIP_TEXT = {'--nv'}   # landing's navy: css/theme.css flips it to var(--text); only its fill/border/shadow uses are mapped here   # the app shell is navy in both themes: its own tokens stay

def strip_comments(s): return re.sub(r'/\*.*?\*/', '', s, flags=re.S)

def parse(s):
    """-> list of ('rule', selector, decls) | ('at', prelude, children) ; skips @font-face/@keyframes."""
    out, i, n = [], 0, len(s)
    while i < n:
        j = s.find('{', i)
        if j < 0: break
        pre = s[i:j].strip()
        # matching brace
        d, k = 1, j + 1
        while k < n and d:
            if s[k] == '{': d += 1
            elif s[k] == '}': d -= 1
            k += 1
        body = s[j + 1:k - 1]
        if ';' in pre and pre.startswith('@'):   # e.g. @import ...; before a rule
            pre = pre.split(';')[-1].strip()
        if pre.startswith('@'):
            if re.match(r'@(media|supports|container|layer)', pre): out.append(('at', pre, parse(body)))
        else:
            out.append(('rule', pre, body))
        i = k
    return out

def split_decls(body):
    parts, depth, cur = [], 0, ''
    for ch in body:
        if ch == '(': depth += 1
        elif ch == ')': depth -= 1
        if ch == ';' and depth == 0: parts.append(cur); cur = ''
        else: cur += ch
    parts.append(cur)
    res = []
    for p in parts:
        if ':' not in p: continue
        k, v = p.split(':', 1); k = k.strip().lower(); v = v.strip()
        if k: res.append((k, v))
    return res

# ---------------------------------------------------------------- variables
VARS = {}
def collect_vars(files):
    for f in ['tokens.css'] + files:
        for kind, pre, body in parse(strip_comments((root / 'css' / f).read_text())):
            if kind == 'rule':
                for k, v in split_decls(body):
                    if k.startswith('--') and (pre.strip() == ':root' or k not in VARS): VARS[k] = v
def resolve(v, depth=0):
    if depth > 8: return v
    return re.sub(r'var\((--[\w-]+)(?:,([^()]*))?\)', lambda m: resolve(VARS.get(m.group(1), m.group(2) or m.group(0)), depth + 1), v)

# ---------------------------------------------------------------- colour maths
def hex2rgb(h):
    h = h.lstrip('#')
    if len(h) in (3, 4): h = ''.join(c * 2 for c in h)
    a = int(h[6:8], 16) / 255 if len(h) == 8 else 1
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)
def lum(c):
    f = lambda v: (v / 255) / 12.92 if v / 255 <= 0.04045 else (((v / 255) + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
def chroma(c): return (max(c[:3]) - min(c[:3])) / 255
def sat(c):
    h, l, s = colorsys.rgb_to_hls(*(x / 255 for x in c[:3])); return s, l, h
def rgbhex(r, g, b): return '#%02x%02x%02x' % tuple(max(0, min(255, round(x))) for x in (r, g, b))
NAMED = {'white': (255, 255, 255, 1), 'black': (0, 0, 0, 1), '#fff': (255, 255, 255, 1)}
COLOR_RE = re.compile(r'var\(--[\w-]+(?:,[^()]*)?\)|#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b')
def to_rgb(tok):
    t = tok.lower()
    if t in NAMED: return NAMED[t]
    if t.startswith('#'): return hex2rgb(t) if len(t) in (4, 5, 7, 9) else None
    if t.startswith('rgb'):
        p = [x for x in re.split(r'[ ,/()]+', t[t.index('(') + 1:]) if x]
        try:
            v = [float(x.rstrip('%')) for x in p[:4]]
            return (v[0], v[1], v[2], v[3] if len(v) > 3 else 1)
        except Exception: return None
    if t.startswith('var('):
        r = resolve(tok)
        return to_rgb(r.strip()) if r != tok and COLOR_RE.fullmatch(r.strip() or 'x') else None
    return None

def is_accent(c):
    if not c or c[3] < .6: return False
    s, l, h = sat(c)
    return chroma(c) >= .3 and s > .45 and l > .38 and lum(c) > .18          # orange, cyan, yellow, green fills: dark text stays dark on them

def lighten_text(c):
    """dark/mid text colour -> a light tone with the same hue, a little desaturated (for dark surfaces)."""
    s, l, h = sat(c); L = lum(c)
    if L < .03: return 'var(--text)'
    if s < .25: return 'var(--text-muted)' if L < .22 else None
    nl = max(.68, min(.82, 1.02 - l * .55))
    r, g, b = colorsys.hls_to_rgb(h, nl, min(s, .85) * .9)
    return rgbhex(r * 255, g * 255, b * 255)

def map_color(tok, kind, onaccent):
    name = re.match(r'var\((--[\w-]+)', tok)
    if name and (name.group(1) in AUTO or SHELL.match(name.group(1))): return None
    if name and name.group(1) in FLIP_TEXT and kind == 'text': return None
    c = to_rgb(tok)
    if c is None: return None
    L = lum(c); s, l, h = sat(c)
    if kind == 'text':
        if onaccent: return None
        if c[3] < .5: return None
        if L > .45: return None                            # already light (white text on navy etc.)
        if s > .5 and 20/360 < h < 50/360: return 'var(--accent-text)'   # orange as text
        if s > .5 and 180/360 < h < 200/360 and L > .1: return 'var(--accent-2-text)'
        if L < .025 or (s < .7 and L < .04): return 'var(--text)'
        if s < .3: return 'var(--text-muted)'
        return lighten_text(c)
    if kind == 'bg':
        if c[3] < .3:                                      # translucent veils
            return 'rgba(255,255,255,%.2f)' % min(.12, c[3]) if L < .05 else None
        ch = chroma(c)
        if L > .985 and ch < .06: return 'var(--surface-1)'
        if L > .86 and ch < .06: return 'var(--bg)'
        if L > .5 and ch < .1: return 'var(--surface-3)'
        if L > .6 and not is_accent(c):                    # light tint (orange wash, cyan wash...) -> dark tint, same hue
            r, g, b = colorsys.hls_to_rgb(h, .16, min(s, .6) * .55)
            return rgbhex(r * 255, g * 255, b * 255)
        if L < .025 and abs(c[2] - c[0]) > 15: return 'var(--fill-inverse)'     # brand navy fills
        if L < .02: return 'var(--surface-1)' if c[3] > .9 else None             # black-ish neutral fills
        return None
    if kind == 'border':
        if c[3] < .3: return None
        if L < .06: return 'var(--border-strong)'
        if L > .5 and chroma(c) < .12: return 'var(--border-subtle)'
        return None
    if kind == 'shadow':
        if L < .06 and c[3] > .5: return 'var(--shadow-ink)'
        return None
    return None

def kind_of(prop):
    if prop in ('color', 'fill', 'stroke', 'caret-color', '-webkit-text-fill-color', 'text-decoration-color', 'text-emphasis-color'): return 'text'
    if prop in ('background', 'background-color', 'background-image'): return 'bg'
    if prop.startswith('border') or prop in ('outline-color', 'column-rule', 'column-rule-color'): return 'border'
    if prop in ('box-shadow', 'text-shadow'): return 'shadow'
    return None

ACCENT_SEL = set()
def _compounds(sel):
    return [re.sub(r'::?[\w-]+(\([^)]*\))?', '', c) for c in re.split(r'\s*[\s>+~]\s*', sel.strip()) if c]
def accent_bg(decls):
    bgs = [v for k, v in decls if k in ('background', 'background-color') and 'gradient' not in v]
    return any(is_accent(to_rgb(m.group(0))) for v in bgs for m in COLOR_RE.finditer(v))
def collect_accents(nodes):
    for kind, pre, body in nodes:
        if kind == 'at': collect_accents(body)
        elif accent_bg(split_decls(body)):
            for s in re.split(r',(?![^()]*\))', pre):
                cs = _compounds(s)
                if cs and cs[-1] and re.search(r'[.#\[]', cs[-1]): ACCENT_SEL.add(cs[-1])
def on_accent_sel(sel):
    for s in re.split(r',(?![^()]*\))', sel):
        for c in _compounds(s):
            if c in ACCENT_SEL or any(a and a in c and re.search(re.escape(a) + r'(?![\w-])', c) for a in ACCENT_SEL if a.count('.') >= 2): return True
    return False

def convert(decls, sel=''):
    onaccent = accent_bg(decls) or on_accent_sel(sel)
    out = []
    for k, v in decls:
        if k.startswith('--'): continue
        kind = kind_of(k)
        if not kind or 'url(' in v and kind != 'bg': continue
        if kind == 'border' and 'outline' not in k and not COLOR_RE.search(v): continue
        changed = [False]
        def rep(m):
            nv = map_color(m.group(0), kind, onaccent)
            if nv: changed[0] = True; return nv
            return m.group(0)
        nv = COLOR_RE.sub(rep, v)
        if changed[0]: out.append((k, nv))
    if not any(k == 'color' for k, v in decls):
        if accent_bg(decls): out.append(('color', 'var(--on-accent)'))
        else:   # a fill re-pointed to a dark role: its own text must flip too (it may sit inside an accent block)
            bg = next((v for k, v in out if k in ('background', 'background-color')), '')
            if re.search(r'var\(--(surface-[123]|bg)\)', bg): out.append(('color', 'var(--text)'))
            elif 'var(--fill-inverse)' in bg: out.append(('color', 'var(--on-inverse)'))
    return out

def scope(sel):
    parts = []
    for s in re.split(r',(?![^()]*\))', sel):
        s = s.strip()
        if not s or 'data-theme' in s or re.search(r'(?<!:not\()\.static\b', s): continue
        if s.startswith(':root') or s.startswith('html'):
            m = re.match(r'(:root|html)((?:\.[\w-]+|:not\([^)]*\)|\[[^\]]*\])*)(.*)', s)
            parts.append(f'{m.group(1)}:where([data-theme=dark]){m.group(2)}{m.group(3)}')
        elif s.startswith('body'): parts.append(':where([data-theme=dark]) ' + s)
        else: parts.append(':where([data-theme=dark]) ' + s)
    return ','.join(parts)

def emit(nodes, ind=''):
    lines = []
    for kind, pre, body in nodes:
        if kind == 'at':
            inner = emit(body, ind)
            if inner: lines.append(pre + '{\n' + '\n'.join(inner) + '\n}')
        else:
            decls = convert(split_decls(body), pre)
            sel = scope(pre)
            if decls and sel: lines.append(sel + '{' + ';'.join(f'{k}:{v}' for k, v in decls) + '}')
    return lines

def build():
    files = [f for f in ORDER if (root / 'css' / f).exists()]
    collect_vars(files)
    for f in files: collect_accents(parse(strip_comments((root / 'css' / f).read_text())))
    out = ['/* GENERATED by tools/theme.py from ' + ' + '.join(files) + ' — dark-theme role mapping. Edit css/theme.css or the sources, then run tools/build.py */']
    n = 0
    for f in files:
        lines = emit(parse(strip_comments((root / 'css' / f).read_text())))
        if lines: out.append(f'/* --- {f} --- */'); out += lines; n += len(lines)
    (root / 'css' / 'theme-dark.css').write_text('\n'.join(out) + '\n')
    return n

if __name__ == '__main__':
    print('theme-dark rules', build())

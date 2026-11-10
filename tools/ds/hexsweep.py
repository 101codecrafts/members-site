"""Replace hard-coded colours in component CSS with ROLE tokens, only where the result is provably identical:
  * light/static: the role's light value equals the literal (same sRGB),
  * dark: tools/theme.py would have mapped that literal to exactly that role in that rule (so the generated override
    it no longer needs paints the same value), and no side effect of the mapping is lost (bg re-points that add a
    text colour are skipped unless the rule sets its own colour).
Rules with data-theme or .static in the selector are left alone. usage: python3 hexsweep.py REPO [--write]"""
import sys, re, pathlib, importlib.util, collections
repo = pathlib.Path(sys.argv[1]); WRITE = '--write' in sys.argv
spec = importlib.util.spec_from_file_location('theme', repo / 'tools/theme.py'); T = importlib.util.module_from_spec(spec); spec.loader.exec_module(T)
files = [f for f in T.ORDER if (repo / 'css' / f).exists() and f not in ('landing.css',)]   # landing.css: r13-landing owns it
T.collect_vars([f for f in T.ORDER if (repo / 'css' / f).exists()])
for f in T.ORDER:
    if (repo / 'css' / f).exists(): T.collect_accents(T.parse(T.strip_comments((repo / 'css' / f).read_text())))
LIGHT = {'var(--text)': '#0b1236', 'var(--border-strong)': '#0b1236', 'var(--shadow-ink)': '#0b1236', 'var(--surface-1)': '#ffffff',
         'var(--fill-inverse)': '#0b1236', 'var(--accent-text)': '#b45309', 'var(--accent-2-text)': '#00758a', 'var(--text-muted)': '#4a5578',
         'var(--border-subtle)': '#d5dbe5', 'var(--surface-3)': '#e8ecf2'}
def norm(h):
    c = T.hex2rgb(h); return None if c[3] != 1 else '#%02x%02x%02x' % c[:3]
HEX = re.compile(r'#[0-9a-fA-F]{3,8}\b')
stats = collections.Counter(); per = collections.Counter()
for f in files:
    p = repo / 'css' / f; src = p.read_text()
    masked = re.sub(r'/\*.*?\*/', lambda m: ' ' * len(m.group(0)), src, flags=re.S)
    edits = []
    for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', masked):
        sel = m.group(1).strip()
        if sel.startswith('@') or 'data-theme' in sel or re.search(r'(?<!:not\()\.static\b', sel): continue
        body = m.group(2); bstart = m.start(2)
        decls = T.split_decls(body); onaccent = T.accent_bg(decls) or T.on_accent_sel(sel)
        has_color = any(k == 'color' for k, v in decls)
        # walk declarations with positions
        pos = 0
        for part in re.split(r';', body):
            seg_start = bstart + pos; pos += len(part) + 1
            if ':' not in part: continue
            k, v = part.split(':', 1); k = k.strip().lower()
            if k.startswith('--'): continue
            kind = T.kind_of(k)
            if not kind or ('url(' in v and kind != 'bg') or 'gradient' in v: continue
            voff = seg_start + part.index(':') + 1
            for hm in HEX.finditer(v):
                lit = hm.group(0); R = T.map_color(lit, kind, onaccent)
                if R not in LIGHT or norm(lit) != LIGHT[R]: continue
                if kind == 'bg' and R in ('var(--surface-1)', 'var(--fill-inverse)', 'var(--surface-3)') and not has_color: continue
                edits.append((voff + hm.start(), voff + hm.end(), R)); stats[R] += 1; per[f] += 1
    if edits and WRITE:
        out = src
        for a, b, r in sorted(edits, reverse=True): out = out[:a] + r + out[b:]
        p.write_text(out)
print('replacements', sum(stats.values()), dict(stats)); print(dict(per))

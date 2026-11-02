# Generates css/tokens.css from tokens/tokens.json (run: python3 tools/tokens.py)
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
t = json.loads((root / 'tokens/tokens.json').read_text())
lines = ['/* GENERATED from tokens/tokens.json by tools/tokens.py — do not edit by hand */', ':root{']
for group, vals in t.items():
    if group.startswith('$'): continue
    for k, v in vals.items():
        lines.append(f'  --{group}-{k}: {v};')
lines.append('}')
(root / 'css/tokens.css').write_text('\n'.join(lines) + '\n')
print('wrote css/tokens.css', sum(len(v) for k, v in t.items() if not k.startswith('$')), 'tokens')

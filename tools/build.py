# Inlines the SVG icon sprite + shared script tags into the static pages (no runtime build step).
import pathlib
root=pathlib.Path(__file__).resolve().parent.parent
icons=(root/'src/icons.svg').read_text()
scripts=(root/'src/scripts.html').read_text() if (root/'src/scripts.html').exists() else ''
for f in (root/'src').glob('*.html'):
    if f.name=='scripts.html': continue
    (root/f.name).write_text(f.read_text().replace('{{ICONS}}',icons).replace('{{SCRIPTS}}',scripts))

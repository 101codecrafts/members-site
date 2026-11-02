#!/bin/bash
# tools/lh.sh page  -> compare/lighthouse-<page>.json (mobile, simulated throttling). Needs: npm i --prefix /tmp/lh lighthouse@12 ; python3 -m http.server 8787
cd "$(dirname "$0")/.."
CHROME_PATH=/usr/bin/chromium timeout 110 /tmp/lh/node_modules/.bin/lighthouse "http://localhost:8787/$1.html" --quiet --chrome-flags="--headless=new --no-sandbox" --output=json --output-path=compare/lighthouse-$1.json --only-categories=performance,accessibility,best-practices,seo --form-factor=mobile --max-wait-for-load=20000 >/dev/null 2>&1
python3 -c "
import json;d=json.load(open('compare/lighthouse-$1.json'));print('$1',{k:round(v['score']*100) if v['score'] is not None else None for k,v in d['categories'].items()})
for cat in ['performance','accessibility','best-practices','seo']:
  for r in d['categories'][cat]['auditRefs']:
    a=d['audits'][r['id']]
    if a['score'] is not None and a['score']<0.9 and r['weight']>0: print('  ',cat, r['id'], a['score'], a.get('displayValue',''))"

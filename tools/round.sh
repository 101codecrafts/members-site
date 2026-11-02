#!/bin/bash
# round.sh dashboard|landing  -> build, screenshot (?static=1), compare
cd "$(dirname "$0")/.."
python3 tools/build.py
U=/workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/files/uploads
if [ "$1" = dashboard ]; then P=dashboard.html; W=1536; H=1024; REF=$U/1005790185-56af1378b8fa.png; else P=index.html; W=1024; H=1536; REF=$U/1005790023-98ca4c67829c.png; fi
python3 tools/shot.py "$P?static=1" compare/final-$1.png $W $H && python3 tools/compare.py $REF compare/final-$1.png $1 compare/regions-$1.json

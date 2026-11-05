#!/bin/bash
# run.sh <role> <width> <pages> <outdir>  — one short flock-guarded chromium run
cd "$(dirname "$0")"
source ../../../ui-pro/round8/integrate/qa/env.sh
export PYTHONPATH=$PYTHONPATH:/usr/local/lib/python3*/site-packages:$(python3 -c "import requests,os;print(os.path.dirname(os.path.dirname(requests.__file__)))")
flock /workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/round11/chromium.lock timeout 600 python3 crawl.py "$@"

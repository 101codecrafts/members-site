#!/bin/bash
cd "$(dirname "$0")"
source ../../../ui-pro/round8/integrate/qa/env.sh
export PYTHONPATH=$PYTHONPATH:$(python3 -c "import requests,os;print(os.path.dirname(os.path.dirname(requests.__file__)))")
timeout 600 flock /workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/round11/chromium.lock env SKIP_PAGES=1 python3 authwalk.py out/auth > authwalk.out 2>&1
echo EXIT $? >> authwalk.out

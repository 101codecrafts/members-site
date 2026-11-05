#!/bin/bash
cd "$(dirname "$0")"
source ../../../ui-pro/round8/integrate/qa/env.sh
flock /workspace/projects/0f17c20f-686b-4124-973f-cedf2560246c/work/round11/chromium.lock timeout 900 python3 recheck.py > recheck.out 2>&1
echo EXIT $? >> recheck.out

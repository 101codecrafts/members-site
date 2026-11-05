#!/bin/bash
cd "$(dirname "$0")"
for cfg in "visitor 1440" "learner 1440" "visitor 412" "learner 412"; do
  set -- $cfg
  split -l 6 pages.txt /tmp/aud_chunk_
  for c in /tmp/aud_chunk_*; do
    P=$(paste -sd, $c)
    echo "== $(date +%T) $1 $2 $P" >> chain.log
    ./run.sh $1 $2 "$P" out/$1-$2 >> chain.log 2>&1
  done
  rm -f /tmp/aud_chunk_*
done
echo DONE $(date +%T) >> chain.log

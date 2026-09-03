#!/usr/bin/env bash
set -uo pipefail
cd ~/bfb-bench; set -a; . ./.env; set +a
echo "START $(date -u)"
python3 dbpedia_bench.py \
  --data-dir ~/vector-db-benchmark/datasets/dbpedia_openai_1M \
  --sizes 100000 200000 500000 975000 --queries 500 --out dbpedia_1m.csv
echo "DONE $(date -u)"

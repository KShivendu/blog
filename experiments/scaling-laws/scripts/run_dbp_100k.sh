#!/usr/bin/env bash
set -euo pipefail
cd ~/bfb-bench
set -a; . ./.env; set +a
DATA=~/vector-db-benchmark/datasets/dbpedia-openai-100K-1536-angular/dbpedia_openai_100K
echo "START $(date -u)"
python3 dbpedia_bench.py --data-dir "$DATA" \
  --sizes 10000 25000 50000 100000 --queries 500 --out dbpedia_100k.csv
echo "DONE $(date -u)"

#!/usr/bin/env bash
# Phase B: HNSW experiments. B1 = dim sweep @1M, B2 = volume sweep @256d.
set -a; . ./.env; set +a
echo "### Phase B1: HNSW dimension sweep @1M  $(date -u +%H:%M:%S)"
python3 bfb_bench.py --index hnsw --sizes 1000000 --dims 128 256 512 768 1536 \
  --out dim_hnsw.csv --index-timeout 3600
echo "### Phase B2: HNSW data-volume sweep @256d  $(date -u +%H:%M:%S)"
python3 bfb_bench.py --index hnsw --dims 256 \
  --sizes 100000 200000 500000 1000000 2000000 5000000 10000000 \
  --out vol_hnsw.csv --index-timeout 7200
echo "### PHASE B DONE $(date -u +%H:%M:%S)"

#!/usr/bin/env bash
# Brute-force "max-N vs latency-SLA" benchmark.
# Single-query (p=1) brute-force latency vs dataset size N, fp32 + binary-quant,
# at a given embedding dim. Invert latency(N) => max vectors servable under an SLA.
# Usage:  ./sla_bf_sweep.sh [DIM]        (default 1536)
#         SIZES="1000 10000 100000" ./sla_bf_sweep.sh 768   (override N grid)
# Requires ./.env with QDRANT_CLUSTER_URL (gRPC :6334) + QDRANT_API_KEY. Never commit .env.
set -uo pipefail
cd "$(dirname "$0")"; set -a; . ./.env; set +a
DIM="${1:-1536}"
IMG=qdrant/bfb:dev; URI="$QDRANT_CLUSTER_URL"
REST=$(echo "$URI" | sed -E "s/:6334/:6333/"); REST="${REST%/}"
SEG=8; Q=800
SIZES="${SIZES:-1000 5000 10000 50000 100000 250000 500000 1000000}"
BFB(){ docker run --rm --network host -e QDRANT_API_KEY "$IMG" ./bfb --uri "$URI" "$@"; }
DEL(){ curl -s -m 25 -o /dev/null -X DELETE "$REST/collections/$1" -H "api-key: $QDRANT_API_KEY"; }
OUT="sla_bf_${DIM}.csv"
echo "n,dim,mode,srv_p50_ms,srv_p95_ms,srv_p99_ms" > "$OUT"
echo "START dim=$DIM $(date -u)"
for MODE in fp32 bq; do
  QUANT=""; [ "$MODE" = "bq" ] && QUANT="--quantization binary"
  for N in $SIZES; do
    C="exp_sla_${MODE}_${DIM}_${N}"; DEL "$C"
    BFB -n "$N" --dim "$DIM" --indexing-threshold 0 $QUANT -p 8 -t 8 --segments "$SEG" --skip-wait-index --collection-name "$C" >/dev/null 2>&1
    LOG=$(BFB -n "$Q" --dim "$DIM" --skip-create --skip-upload --search --skip-wait-index $QUANT -p 1 -t 1 -c 2 --collection-name "$C" 2>&1)
    p50=$(echo "$LOG"|awk '/Median server time/{printf "%.3f",$NF*1000}')
    p95=$(echo "$LOG"|awk '/p95 server time/{printf "%.3f",$NF*1000}')
    p99=$(echo "$LOG"|awk '/p99 server time/{printf "%.3f",$NF*1000}')
    echo "$N,$DIM,$MODE,$p50,$p95,$p99" | tee -a "$OUT"
    DEL "$C"
  done
done
echo "DONE dim=$DIM $(date -u)"

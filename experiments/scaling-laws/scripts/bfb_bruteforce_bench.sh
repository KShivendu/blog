#!/usr/bin/env bash
# Brute-force latency/throughput benchmark for "scaling laws for vector search".
# Client: tpuf-bench (runs bfb via docker).  Server: remote Qdrant cluster (from .env).
# Scope: NO HNSW (--indexing-threshold 0), dim=256, random vectors, fp32 vs binary-quant,
#        sizes 100k -> 1M. Latency/throughput only (no recall).
#
# Reads QDRANT_CLUSTER_URL + QDRANT_API_KEY from ./.env (never printed).
# bfb reads QDRANT_API_KEY from env; cluster endpoint passed via --uri.
# Collections are named bf_<mode>_<N> and each is DELETED right after it's measured.
# It NEVER touches 'benchmark' or any pre-existing collection.
set -euo pipefail

# ---- load secrets (not printed) ----
[ -f ./.env ] || { echo "ERROR: ./.env not found (run from the dir containing it)"; exit 1; }
set -a; . ./.env; set +a
: "${QDRANT_CLUSTER_URL:?QDRANT_CLUSTER_URL missing from .env}"
: "${QDRANT_API_KEY:?QDRANT_API_KEY missing from .env}"
REST_URL=$(echo "$QDRANT_CLUSTER_URL" | sed -E 's#:6334#:6333#')   # gRPC :6334 -> REST :6333

# ---- config (override via env) ----
DIM=${DIM:-256}
SIZES=(${SIZES:-100000 200000 500000 1000000})
SEARCH_N=${SEARCH_N:-2000}                 # search queries per cell
P=${P:-8}; T=${T:-8}; SEG=${SEG:-8}        # parallel / threads / segments (from exa-more.md)
IMG=${IMG:-qdrant/bfb:dev}   # :dev supports --quantization binary (stable tag does not)
OUT=${OUT:-results.csv}
DRY=${DRY:-0}

BFB_RUN() { docker run --rm --network host -e QDRANT_API_KEY "$IMG" ./bfb --uri "$QDRANT_CLUSTER_URL" "$@"; }
metric() { grep -m1 "$1" "$2" | grep -oE "[0-9]+\.[0-9eE+-]+" | head -1; }

echo "Cluster (host only): $(echo "$QDRANT_CLUSTER_URL" | sed -E 's#(https?://[^/]*).*#\1#')"
echo "API key present: $([ -n "${QDRANT_API_KEY:-}" ] && echo yes || echo NO)"
# preflight: cluster reachable + confirm we will not collide with existing collections
EXIST=$(curl -s -H "api-key: $QDRANT_API_KEY" "$REST_URL/collections" | tr ',' '\n' | grep -oE '"name":"[^"]+"' || true)
echo "Existing collections: $(echo "$EXIST" | sed 's/"name"://;s/"//g' | tr '\n' ' ')"
if echo "$EXIST" | grep -q '"name":"bf_'; then
  echo "ERROR: a bf_* collection already exists on the cluster; refusing to proceed."; exit 1
fi

echo "n,dim,mode,upload_s,req_p50,req_p95,req_p99,srv_p50,srv_p95,srv_p99,rps" > "$OUT"

for N in "${SIZES[@]}"; do
  for MODE in fp32 bq bq_norescore; do
    COLL="bf_${MODE}_${N}"
    case "$MODE" in
      fp32)         QUANT_UP=(); QUANT_SE=() ;;
      bq)           QUANT_UP=(--quantization binary --quantization-in-ram true); QUANT_SE=(--quantization binary) ;;
      bq_norescore) QUANT_UP=(--quantization binary --quantization-in-ram true); QUANT_SE=(--quantization binary --quantization-rescore false) ;;
    esac

    if [[ "$COLL" == "benchmark" ]]; then echo "REFUSING reserved name"; exit 1; fi

    echo "=== $COLL : upload (brute force, indexing disabled) ==="
    UP_LOG=$(mktemp); SE_LOG=$(mktemp)
    start=$(date +%s.%N)
    if [[ "$DRY" == "1" ]]; then
      echo "+ BFB_RUN -n $N --dim $DIM --indexing-threshold 0 ${QUANT_UP[*]} -p $P -t $T --segments $SEG --skip-wait-index --collection-name $COLL"
    else
      BFB_RUN -n "$N" --dim "$DIM" --indexing-threshold 0 "${QUANT_UP[@]}" \
        -p "$P" -t "$T" --segments "$SEG" --skip-wait-index --collection-name "$COLL" 2>&1 | tee "$UP_LOG"
    fi
    end=$(date +%s.%N); upload_s=$(awk "BEGIN{printf \"%.2f\", $end-$start}")

    echo "=== $COLL : search ($SEARCH_N full-scan queries) ==="
    if [[ "$DRY" == "1" ]]; then
      echo "+ BFB_RUN -n $SEARCH_N --dim $DIM --skip-create --skip-upload --search --skip-wait-index ${QUANT_SE[*]} -p $P -t $T --collection-name $COLL"
    else
      BFB_RUN -n "$SEARCH_N" --dim "$DIM" --skip-create --skip-upload --search --skip-wait-index \
        "${QUANT_SE[@]}" -p "$P" -t "$T" --collection-name "$COLL" 2>&1 | tee "$SE_LOG"
      echo "$N,$DIM,$MODE,$upload_s,\
$(metric 'Median request time' "$SE_LOG"),$(metric 'p95 request time' "$SE_LOG"),$(metric 'p99 request time' "$SE_LOG"),\
$(metric 'Median server time' "$SE_LOG"),$(metric 'p95 server time' "$SE_LOG"),$(metric 'p99 server time' "$SE_LOG"),\
$(metric 'Median rps' "$SE_LOG")" >> "$OUT"
      # delete ONLY this run's own collection
      echo "--- deleting $COLL ---"
      curl -s -X DELETE -H "api-key: $QDRANT_API_KEY" "$REST_URL/collections/$COLL" >/dev/null || true
    fi
    rm -f "$UP_LOG" "$SE_LOG"
  done
done

echo "=== done -> $OUT ==="
[[ "$DRY" != "1" ]] && column -s, -t "$OUT" || true

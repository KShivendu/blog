#!/usr/bin/env bash
set -uo pipefail
cd ~/bfb-bench; set -a; . ./.env; set +a
IMG=qdrant/bfb:dev; URI="$QDRANT_CLUSTER_URL"
COLL=exp_ol_bf_100k_d256; N=100000; DIM=256; SEG=8
BFB(){ docker run --rm --network host -e QDRANT_API_KEY "$IMG" ./bfb --uri "$URI" "$@"; }
echo "START $(date -u)"
curl -s -X DELETE "${URI%/}/collections/$COLL" -H "api-key: $QDRANT_API_KEY" >/dev/null 2>&1 || true
echo "=== upload ==="
BFB -n $N --dim $DIM --indexing-threshold 0 -p 8 -t 8 --segments $SEG --skip-wait-index --collection-name $COLL >/dev/null 2>&1
OUT=~/bfb-bench/openloop_sweep.csv
echo "target_rps,achieved_rps,srv_p50_ms,srv_p95_ms,srv_p99_ms,client_cpu_pct" > $OUT
for R in 200 400 800 1600 3200; do
  Q=$(( R * 8 ))
  ( while true; do awk '/^cpu /{print $2+$3+$4+$7+$8, $2+$3+$4+$5+$6+$7+$8; exit}' /proc/stat; sleep 1; done ) > /tmp/cpu_$R.samp &
  SAMP=$!
  LOG=$(BFB -n $Q --dim $DIM --skip-create --skip-upload --search --skip-wait-index --rps $R -c 64 -t 8 --collection-name $COLL 2>&1)
  kill $SAMP 2>/dev/null || true
  ach=$(echo "$LOG" | awk '/Avg rps/{printf "%.0f",$NF}')
  p50=$(echo "$LOG" | awk '/Median server time/{printf "%.2f",$NF*1000}')
  p95=$(echo "$LOG" | awk '/p95 server time/{printf "%.2f",$NF*1000}')
  p99=$(echo "$LOG" | awk '/p99 server time/{printf "%.2f",$NF*1000}')
  cpu=$(awk 'NR>1{db=$1-pb;dt=$2-pt;if(dt>0){s+=100*db/dt;n++}}{pb=$1;pt=$2}END{if(n>0)printf "%.0f",s/n;else print "?"}' /tmp/cpu_$R.samp)
  echo "$R,$ach,$p50,$p95,$p99,$cpu" | tee -a $OUT
done
curl -s -X DELETE "${URI%/}/collections/$COLL" -H "api-key: $QDRANT_API_KEY" >/dev/null 2>&1 && echo "deleted"
echo "DONE $(date -u)"

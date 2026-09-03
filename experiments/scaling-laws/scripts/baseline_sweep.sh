#!/usr/bin/env bash
# Clean 2-vCPU baseline: closed-loop concurrency sweep, wall-clock TRUE throughput.
# bfb uses gRPC (:6334); cleanup uses REST (:6333). Client idle, -c 4 pool.
set -uo pipefail
cd ~/bfb-bench; set -a; . ./.env; set +a
IMG=qdrant/bfb:dev; URI="$QDRANT_CLUSTER_URL"
REST=$(echo "$URI" | sed -E "s/:6334/:6333/"); REST="${REST%/}"
COLL=exp_base_bf; N=100000; DIM=256; SEG=8
BFB(){ docker run --rm --network host -e QDRANT_API_KEY "$IMG" ./bfb --uri "$URI" "$@"; }
DEL(){ curl -s -m 15 -o /dev/null -X DELETE "$REST/collections/$COLL" -H "api-key: $QDRANT_API_KEY"; }
echo "START $(date -u)"
DEL
BFB -n $N --dim $DIM --indexing-threshold 0 -p 8 -t 8 --segments $SEG --skip-wait-index --collection-name $COLL >/dev/null 2>&1
OUT=~/bfb-bench/baseline_sweep.csv
echo "p,true_rps,srv_p50_ms,srv_p95_ms,srv_p99_ms,client_cpu_pct" > $OUT
for P in 1 2 3 4 6 8 12 16 24 32; do
  T=$(( P<8 ? P : 8 )); Q=$(( P*200<1500 ? 1500 : P*200 ))
  ( while true; do awk "/^cpu /{print \$2+\$3+\$4+\$7+\$8, \$2+\$3+\$4+\$5+\$6+\$7+\$8; exit}" /proc/stat; sleep 1; done ) > /tmp/b_$P.samp &
  S=$!; t0=$(date +%s.%N)
  LOG=$(BFB -n $Q --dim $DIM --skip-create --skip-upload --search --skip-wait-index -p $P -t $T -c 4 --collection-name $COLL 2>&1)
  t1=$(date +%s.%N); kill $S 2>/dev/null
  trps=$(awk "BEGIN{printf \"%.0f\",$Q/($t1-$t0)}")
  p50=$(echo "$LOG"|awk "/Median server time/{printf \"%.2f\",\$NF*1000}")
  p95=$(echo "$LOG"|awk "/p95 server time/{printf \"%.2f\",\$NF*1000}")
  p99=$(echo "$LOG"|awk "/p99 server time/{printf \"%.2f\",\$NF*1000}")
  ccpu=$(awk "NR>1{db=\$1-pb;dt=\$2-pt;if(dt>0){s+=100*db/dt;n++}}{pb=\$1;pt=\$2}END{if(n>0)printf \"%.0f\",s/n}" /tmp/b_$P.samp)
  echo "$P,$trps,$p50,$p95,$p99,$ccpu" | tee -a $OUT
done
DEL && echo "cleaned"
echo "DONE $(date -u)"

#!/usr/bin/env bash
set -uo pipefail
cd ~/bfb-bench; set -a; . ./.env; set +a
IMG=qdrant/bfb:dev; URI="$QDRANT_CLUSTER_URL"
COLL=exp_conc_bf_100k_d256; N=100000; DIM=256; SEG=8; Q=1500
BFB(){ docker run --rm --network host -e QDRANT_API_KEY "$IMG" ./bfb --uri "$URI" "$@"; }
cpub(){ awk '/^cpu /{print $2+$3+$4+$7+$8; exit}' /proc/stat; }
cput(){ awk '/^cpu /{print $2+$3+$4+$5+$6+$7+$8; exit}' /proc/stat; }
echo "START $(date -u)"
curl -s -X DELETE "${URI%/}/collections/$COLL" -H "api-key: $QDRANT_API_KEY" >/dev/null 2>&1 || true
echo "=== upload $N x $DIM fp32, no index ==="
BFB -n $N --dim $DIM --indexing-threshold 0 -p 8 -t 8 --segments $SEG --skip-wait-index --collection-name $COLL >/dev/null 2>&1
OUT=~/bfb-bench/conc_sweep.csv
echo "p,srv_p50_ms,srv_p95_ms,srv_p99_ms,avg_rps,client_cpu_pct" > $OUT
for P in 1 2 4 8 16 24 32 48 64 96 128; do
  T=$(( P < 8 ? P : 8 ))
  b0=$(cpub); t0=$(cput)
  BFB -n $Q --dim $DIM --skip-create --skip-upload --search --skip-wait-index -p $P -t $T --collection-name $COLL > /tmp/bfb_$P.out 2>&1
  b1=$(cpub); t1=$(cput)
  cpu=$(awk -v b0=$b0 -v t0=$t0 -v b1=$b1 -v t1=$t1 'BEGIN{d=t1-t0; if(d>0) printf "%.0f",100*(b1-b0)/d; else printf "0"}')
  p50=$(awk '/Median server time/{printf "%.2f",$NF*1000}' /tmp/bfb_$P.out)
  p95=$(awk '/p95 server time/{printf "%.2f",$NF*1000}' /tmp/bfb_$P.out)
  p99=$(awk '/p99 server time/{printf "%.2f",$NF*1000}' /tmp/bfb_$P.out)
  rps=$(awk '/Avg rps/{printf "%.1f",$NF}' /tmp/bfb_$P.out)
  echo "$P,$p50,$p95,$p99,$rps,$cpu" | tee -a $OUT
done
curl -s -X DELETE "${URI%/}/collections/$COLL" -H "api-key: $QDRANT_API_KEY" >/dev/null 2>&1 && echo "deleted $COLL"
echo "DONE $(date -u)"

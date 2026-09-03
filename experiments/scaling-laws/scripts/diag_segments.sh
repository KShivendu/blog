set -a; . ./.env; set +a
REST=$(echo "$QDRANT_CLUSTER_URL" | sed -E "s#:6334#:6333#")
for N in 2000000 5000000 10000000; do
  C=diag_fp32_$N
  docker run --rm --network host -e QDRANT_API_KEY qdrant/bfb:dev ./bfb --uri "$QDRANT_CLUSTER_URL" --timeout 120 -n $N --dim 256 --indexing-threshold 0 -p 8 -t 8 --segments 8 --skip-wait-index --collection-name $C >/dev/null 2>&1
  info=$(curl -s -H "api-key: $QDRANT_API_KEY" "$REST/collections/$C")
  segs=$(echo "$info" | python3 -c "import sys,json;d=json.load(sys.stdin)[\"result\"];print(d.get(\"segments_count\"))")
  echo "N=$N -> segments=$segs"
  curl -s -X DELETE -H "api-key: $QDRANT_API_KEY" "$REST/collections/$C" >/dev/null
done
echo "DIAG DONE"

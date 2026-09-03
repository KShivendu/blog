#!/usr/bin/env python3
"""Real-data (dbpedia-openai, 1536-d cosine) HNSW-vs-brute-force scaling + recall.

For each scale N (first N rows of the corpus):
  1. Brute force  : upload N vectors, exact full-scan search of the query set.
                    -> BF latency, and the exact top-K = ground truth for recall.
  2. HNSW         : upload N, flip indexing on (time it), search.
                    -> HNSW latency, indexing time, recall@K vs the BF ground truth.
Both collections are deleted after each scale. Uses a fresh exp_db_* prefix and
never touches pre-existing collections.

Reads QDRANT_CLUSTER_URL + QDRANT_API_KEY from env.

  set -a; . ./.env; set +a
  ./venv-or-python dbpedia_bench.py --data-dir <dir> --sizes 100000 250000 500000 1000000 \
        --queries 500 --out dbpedia.csv
"""
import argparse, csv, json, os, re, sys, time
import numpy as np
from qdrant_client import QdrantClient
from qdrant_client.models import (Distance, VectorParams, OptimizersConfigDiff,
                                   HnswConfigDiff, SearchParams)

K = 10
CSV_FIELDS = ["n", "index", "recall", "upload_s", "index_s",
              "p50_ms", "p90_ms", "p95_ms", "p99_ms", "mean_ms", "qps_1client"]


def pct(xs, p):
    xs = sorted(xs); return xs[min(len(xs)-1, int(round(p/100*(len(xs)-1))))] * 1000.0


def lat_block(lat):
    return dict(p50_ms=round(pct(lat,50),3), p90_ms=round(pct(lat,90),3),
                p95_ms=round(pct(lat,95),3), p99_ms=round(pct(lat,99),3),
                mean_ms=round(sum(lat)/len(lat)*1000,3),
                qps_1client=round(len(lat)/sum(lat),1))


def load_queries(data_dir, nq):
    Q = []
    with open(os.path.join(data_dir, "tests.jsonl")) as f:
        for i, line in enumerate(f):
            if i >= nq: break
            Q.append(json.loads(line)["query"])
    return np.asarray(Q, dtype=np.float32)


def search_all(client, coll, queries, k, exact):
    """Sequential single-client search; returns (list_of_id_lists, latencies_s)."""
    sp = SearchParams(exact=exact)
    ids, lat = [], []
    for q in queries:
        t = time.perf_counter()
        r = client.query_points(coll, query=q.tolist(), limit=k, search_params=sp,
                                with_payload=False).points
        lat.append(time.perf_counter() - t)
        ids.append([p.id for p in r])
    return ids, lat


def recall_at_k(got, gt):
    return sum(len(set(a) & set(b)) / len(b) for a, b in zip(got, gt)) / len(gt)


def wait_indexed(client, coll, n, timeout):
    t0 = time.time()
    while True:
        info = client.get_collection(coll)
        if str(info.status) .endswith("green") and (info.indexed_vectors_count or 0) >= n:
            return round(time.time()-t0, 2)
        if time.time()-t0 > timeout:
            print(f"  WARN: index wait timed out ({timeout}s) status={info.status} "
                  f"indexed={info.indexed_vectors_count}/{n}")
            return round(time.time()-t0, 2)
        time.sleep(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data-dir", required=True)
    ap.add_argument("--sizes", type=int, nargs="+", required=True)
    ap.add_argument("--queries", type=int, default=500)
    ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--prefix", default="exp_db_")
    ap.add_argument("--out", default="dbpedia.csv")
    ap.add_argument("--index-timeout", type=int, default=14400)
    ap.add_argument("--upload-parallel", type=int, default=4)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    global K; K = args.k

    uri = os.environ["QDRANT_CLUSTER_URL"]; key = os.environ["QDRANT_API_KEY"]
    rest = uri.replace(":6334", ":6333")
    print(f"cluster: {re.sub(r'(https?://[^/]*).*', r'\\1', uri)}")
    print(f"data-dir: {args.data_dir}  sizes={args.sizes}  queries={args.queries} k={K}")

    vectors = np.load(os.path.join(args.data_dir, "vectors.npy"), mmap_mode="r")
    dim = vectors.shape[1]
    queries = load_queries(args.data_dir, args.queries)
    print(f"corpus {vectors.shape} {vectors.dtype}, queries {queries.shape}")
    assert max(args.sizes) <= vectors.shape[0], "size exceeds corpus"

    client = QdrantClient(url=rest, api_key=key, prefer_grpc=True, timeout=1200)
    existing = [c.name for c in client.get_collections().collections]
    print("existing collections:", existing)
    clash = [c for c in existing if c.startswith(args.prefix)]
    if clash: sys.exit(f"ERROR: {args.prefix}* already exists: {clash}")
    if args.dry_run:
        print("dry-run OK (connection works, no collision)"); return

    new = not os.path.exists(args.out)
    fout = open(args.out, "a", newline=""); w = csv.DictWriter(fout, fieldnames=CSV_FIELDS)
    if new: w.writeheader(); fout.flush()

    def make(coll, threshold):
        try: client.delete_collection(coll)
        except Exception: pass
        client.create_collection(coll,
            vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
            optimizers_config=OptimizersConfigDiff(indexing_threshold=threshold),
            hnsw_config=HnswConfigDiff(m=16, ef_construct=100))

    def upload(coll, n):
        t = time.perf_counter()
        client.upload_collection(coll, vectors=np.asarray(vectors[:n]),
                                 ids=range(n), batch_size=256,
                                 parallel=args.upload_parallel, wait=True)
        return round(time.perf_counter()-t, 2)

    for n in args.sizes:
        print(f"\n===== N={n} =====")
        # --- brute force (ground truth) ---
        bf = f"{args.prefix}bf_{n}"
        make(bf, 0)                       # indexing disabled -> exact full scan
        up = upload(bf, n)
        print(f"[bf]   uploaded {n} in {up}s; exact search {args.queries} queries...")
        gt, blat = search_all(client, bf, queries, K, exact=True)
        w.writerow({"n": n, "index": "bf", "recall": 1.0, "upload_s": up, "index_s": "",
                    **lat_block(blat)}); fout.flush()
        print(f"[bf]   p50={pct(blat,50):.2f}ms")
        # --- hnsw ---
        hn = f"{args.prefix}hnsw_{n}"
        make(hn, 0)
        up2 = upload(hn, n)
        print(f"[hnsw] uploaded; triggering indexing (threshold 0->1)...")
        client.update_collection(hn, optimizers_config=OptimizersConfigDiff(indexing_threshold=1))
        idx = wait_indexed(client, hn, n, args.index_timeout)
        print(f"[hnsw] indexed in {idx}s; search...")
        got, hlat = search_all(client, hn, queries, K, exact=False)
        rec = round(recall_at_k(got, gt), 4)
        w.writerow({"n": n, "index": "hnsw", "recall": rec, "upload_s": up2, "index_s": idx,
                    **lat_block(hlat)}); fout.flush()
        print(f"[hnsw] p50={pct(hlat,50):.2f}ms recall@{K}={rec}")
        for c in (bf, hn):
            try: client.delete_collection(c)
            except Exception: pass
        print(f"--- deleted {bf}, {hn} ---")

    fout.close()
    print(f"\n=== done -> {args.out} ===")
    with open(args.out) as f: print(f.read())


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Brute-force / HNSW vector-search scaling benchmark for the "scaling laws" post.

Drives `bfb` (via docker) against a remote Qdrant cluster. Sweeps over
dimensions x dataset sizes x {fp32, bq}, for either:
  --index bf    : HNSW disabled (indexing_threshold=0), every query is a full scan.
  --index hnsw  : upload with indexing_threshold=0, then PATCH it to 1 to trigger
                  indexing, time how long indexing takes, then search.

Reads QDRANT_CLUSTER_URL and QDRANT_API_KEY from the environment
(`set -a; . ./.env; set +a` before running). bfb reads QDRANT_API_KEY; we forward
it to the container with `-e` so the value never hits argv.

Each cell uses collection <prefix><index>_<mode>_<N>_d<dim>, DELETEd after measuring.
Refuses to run if any collection with <prefix> already exists; never touches others.

Examples:
  set -a; . ./.env; set +a
  # brute-force dimension sweep at 1M
  python3 bfb_bench.py --index bf --sizes 1000000 --dims 128 256 512 768 1536 --out dim_bf.csv
  # HNSW dimension sweep at 1M
  python3 bfb_bench.py --index hnsw --sizes 1000000 --dims 128 256 512 768 1536 --out dim_hnsw.csv
  # HNSW data-volume sweep at 256d
  python3 bfb_bench.py --index hnsw --dims 256 --sizes 100000 1000000 10000000 --out vol_hnsw.csv
"""
import argparse
import csv
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import urllib.error

METRICS = {
    "req_p50": "Median request time",
    "req_p95": "p95 request time",
    "req_p99": "p99 request time",
    "srv_p50": "Median server time",
    "srv_p95": "p95 server time",
    "srv_p99": "p99 server time",
    "rps": "Median rps",
}
CSV_FIELDS = ["n", "dim", "mode", "index", "upload_s", "index_s",
              "req_p50", "req_p95", "req_p99",
              "srv_p50", "srv_p95", "srv_p99", "rps"]


def rest_base(uri):
    return uri.replace(":6334", ":6333")


def rest_request(base, path, api_key, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, method=method, data=data)
    req.add_header("api-key", api_key)
    if data is not None:
        req.add_header("content-type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as r:
        out = r.read().decode()
    return json.loads(out) if out.strip() else {}


def list_collections(base, api_key):
    d = rest_request(base, "/collections", api_key)
    return [c["name"] for c in d.get("result", {}).get("collections", [])]


def collection_info(base, coll, api_key):
    return rest_request(base, f"/collections/{coll}", api_key).get("result", {})


def bfb_base_cmd(image, uri, timeout):
    # docker entrypoint quirk: CMD is ./bfb, so we must repeat it after the image.
    return ["docker", "run", "--rm", "--network", "host",
            "-e", "QDRANT_API_KEY", image, "./bfb", "--uri", uri,
            "--timeout", str(timeout)]


def run_streaming(cmd, env, dry):
    if dry:
        print("+ " + " ".join(cmd))
        return ""
    proc = subprocess.Popen(cmd, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True, bufsize=1)
    lines = []
    for line in proc.stdout:
        sys.stdout.write(line); sys.stdout.flush()
        lines.append(line)
    proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"command failed ({proc.returncode}): {' '.join(cmd)}")
    return "".join(lines)


def parse_metrics(text):
    out = {}
    for key, label in METRICS.items():
        m = re.search(re.escape(label) + r":\s*([0-9.eE+-]+)", text)
        out[key] = float(m.group(1)) if m else ""
    return out


def quant_args(mode):
    if mode == "bq":
        return (["--quantization", "binary", "--quantization-in-ram", "true"],
                ["--quantization", "binary"])
    return ([], [])  # fp32


def trigger_indexing_and_wait(base, coll, api_key, poll_timeout):
    """PATCH indexing_threshold 0->1, then poll until fully indexed. Returns seconds."""
    info = collection_info(base, coll, api_key)
    points = info.get("points_count") or 0
    rest_request(base, f"/collections/{coll}", api_key, method="PATCH",
                 body={"optimizers_config": {"indexing_threshold": 1}})
    t0 = time.time()
    while True:
        info = collection_info(base, coll, api_key)
        status = info.get("status")
        indexed = info.get("indexed_vectors_count") or 0
        if status == "green" and indexed >= points and points > 0:
            return round(time.time() - t0, 2)
        if time.time() - t0 > poll_timeout:
            print(f"  WARN: indexing poll timed out after {poll_timeout}s "
                  f"(status={status}, indexed={indexed}/{points})")
            return round(time.time() - t0, 2)
        time.sleep(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--index", choices=["bf", "hnsw"], default="bf")
    ap.add_argument("--sizes", type=int, nargs="+", default=[1_000_000])
    ap.add_argument("--dims", type=int, nargs="+", default=[256])
    ap.add_argument("--modes", nargs="+", default=["fp32", "bq"])
    ap.add_argument("--search-n", type=int, default=2000)
    ap.add_argument("--big-threshold", type=int, default=5_000_000)
    ap.add_argument("--big-search-n", type=int, default=500)
    ap.add_argument("--parallel", "-p", type=int, default=8)
    ap.add_argument("--threads", "-t", type=int, default=8)
    ap.add_argument("--segments", type=int, default=8)
    ap.add_argument("--timeout", type=int, default=120)
    ap.add_argument("--index-timeout", type=int, default=3600,
                    help="max seconds to wait for HNSW indexing to finish")
    ap.add_argument("--prefix", default="exp_")
    ap.add_argument("--image", default="qdrant/bfb:dev")
    ap.add_argument("--out", default="results.csv")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    uri = os.environ.get("QDRANT_CLUSTER_URL")
    api_key = os.environ.get("QDRANT_API_KEY")
    if not uri or not api_key:
        sys.exit("ERROR: set QDRANT_CLUSTER_URL and QDRANT_API_KEY (source .env first)")
    base = rest_base(uri)
    host = re.sub(r"(https?://[^/]*).*", r"\1", uri)
    print(f"Cluster (host only): {host}")
    print(f"index={args.index} sizes={args.sizes} dims={args.dims} modes={args.modes}")

    if not args.dry_run:
        existing = list_collections(base, api_key)
        print("Existing collections:", " ".join(existing))
        clash = [c for c in existing if c.startswith(args.prefix)]
        if clash:
            sys.exit(f"ERROR: collections with prefix '{args.prefix}' already exist: {clash}")

    new_file = not os.path.exists(args.out)
    fout = open(args.out, "a", newline="")
    writer = csv.DictWriter(fout, fieldnames=CSV_FIELDS)
    if new_file:
        writer.writeheader(); fout.flush()

    base_cmd = bfb_base_cmd(args.image, uri, args.timeout)
    env = dict(os.environ)

    for dim in args.dims:
        for n in args.sizes:
            sn = args.big_search_n if n >= args.big_threshold else args.search_n
            for mode in args.modes:
                coll = f"{args.prefix}{args.index}_{mode}_{n}_d{dim}"
                q_up, q_se = quant_args(mode)

                # 1) upload with indexing disabled (threshold 0)
                print(f"\n=== {coll} : upload (indexing_threshold=0) ===")
                up_cmd = base_cmd + ["-n", str(n), "--dim", str(dim),
                                     "--indexing-threshold", "0", *q_up,
                                     "-p", str(args.parallel), "-t", str(args.threads),
                                     "--segments", str(args.segments),
                                     "--skip-wait-index", "--collection-name", coll]
                t0 = time.time()
                run_streaming(up_cmd, env, args.dry_run)
                upload_s = round(time.time() - t0, 2)

                # 2) HNSW: flip threshold to 1 and time the indexing
                index_s = ""
                if args.index == "hnsw":
                    print(f"=== {coll} : trigger indexing (threshold 0 -> 1), timing ===")
                    if args.dry_run:
                        print(f"+ PATCH /collections/{coll} optimizers_config.indexing_threshold=1 ; poll until green")
                    else:
                        index_s = trigger_indexing_and_wait(base, coll, api_key, args.index_timeout)
                        print(f"--- indexing took {index_s}s ---")

                # 3) search
                print(f"=== {coll} : search ({sn} queries) ===")
                se_cmd = base_cmd + ["-n", str(sn), "--dim", str(dim),
                                     "--skip-create", "--skip-upload", "--search",
                                     "--skip-wait-index", *q_se,
                                     "-p", str(args.parallel), "-t", str(args.threads),
                                     "--collection-name", coll]
                text = run_streaming(se_cmd, env, args.dry_run)

                if not args.dry_run:
                    row = {"n": n, "dim": dim, "mode": mode, "index": args.index,
                           "upload_s": upload_s, "index_s": index_s,
                           **parse_metrics(text)}
                    writer.writerow(row); fout.flush()
                    print(f"--- deleting {coll} ---")
                    try:
                        rest_request(base, f"/collections/{coll}", api_key, method="DELETE")
                    except urllib.error.URLError as e:
                        print(f"  warn: delete failed: {e}")

    fout.close()
    print(f"\n=== done -> {args.out} ===")
    if not args.dry_run:
        with open(args.out) as f:
            print(f.read())


if __name__ == "__main__":
    main()

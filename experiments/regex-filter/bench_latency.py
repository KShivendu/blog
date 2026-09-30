"""Build time, query latency, QPS, and how all three scale with corpus size.

End-to-end latency = filter time + verification time on the candidates the
filter returned. Verification uses the same `re` engine for every method, so
that half is directly comparable; the filter half is pure-Python set algebra
and is therefore pessimistic in absolute terms but comparable BETWEEN methods.

Run from the repo root:  python experiments/regex-filter/bench_latency.py
"""
import gc
import json
import os
import random
import re
import statistics as st
import sys
import time
from collections import defaultdict

sys.path.insert(0, "experiments/regex-filter")

from indexes import (ENC, build_sparse, build_token, build_token_normalized,
                     build_trigram, build_vocab_sidecar, postings, vocab_strings)
from evaluate import (and_or, make_sparse_resolver, make_token_full_resolver,
                      make_token_word_resolver, make_trigram_resolver)
from literals import required

DATA = "experiments/regex-filter/data"
SIZES = [int(x) for x in os.environ.get("SIZES", "500,1000,2000,4000,8000").split(",")]
N_PATTERNS = int(os.environ.get("N_PATTERNS", 150))
MINLEN = 3


def pct(xs, p):
    xs = sorted(xs)
    return xs[min(len(xs) - 1, int(p * len(xs)))]


def main():
    all_docs = json.load(open(f"{DATA}/docs_test.json"))
    PATFILE = os.environ.get("PATTERNS", "patterns.json")
    pats = [p for p, _ in json.load(open(f"{DATA}/{PATFILE}"))]
    if "agent" in PATFILE:   # plain grep is BRE: \| \( \) are metacharacters
        pats = [x.replace(r"\|", "|").replace(r"\(", "(").replace(r"\)", ")") for x in pats]
    rng = random.Random(0)
    pats = rng.sample(pats, N_PATTERNS)
    plans = []
    for p in pats:
        try:
            plans.append((p, re.compile(p), required(p, MINLEN)))
        except re.error:
            pass
    print(f"{len(plans)} patterns, sizes {SIZES}\n", flush=True)

    V = vocab_strings()
    side = build_vocab_sidecar(V, 3)
    out = []

    for N in SIZES:
        docs = all_docs[:N]
        nb = sum(len(d) for d in docs)
        universe = frozenset(range(N))
        print(f"=== {N:,} docs, {nb/1e6:.1f} MB", flush=True)

        builds, idx = {}, {}
        t = time.perf_counter(); idx["tri"] = build_trigram(docs); builds["dense trigram"] = time.perf_counter() - t
        t = time.perf_counter(); idx["spa"] = build_sparse(docs);  builds["TopK sparse"] = time.perf_counter() - t
        t = time.perf_counter(); uni, bi = build_token(docs);      tb = time.perf_counter() - t
        t = time.perf_counter(); nrm = build_token_normalized(docs); builds["token word-aligned"] = time.perf_counter() - t
        t = time.perf_counter()
        vtri = defaultdict(set)
        for g, tids in side.items():
            s = set()
            for tk in tids:
                s |= uni.get(tk, set())
            if s:
                vtri[g] |= s
        for (a, b), ds in bi.items():
            sa, sb = V.get(a), V.get(b)
            if not sa or not sb:
                continue
            j = sa + sb
            lo, hi = max(0, len(sa) - 2), min(len(j) - 2, len(sa))
            for k in range(lo, hi + 1):
                vtri[j[k : k + 3]] |= ds
        builds["token + bigram"] = tb + (time.perf_counter() - t)

        sizes = {"dense trigram": postings(idx["tri"]), "TopK sparse": postings(idx["spa"]),
                 "token word-aligned": postings(nrm),
                 "token + bigram": postings(uni) + postings(bi)}

        methods = {
            "dense trigram": make_trigram_resolver(idx["tri"], universe),
            "TopK sparse": make_sparse_resolver(idx["spa"], universe),
            "token word-aligned": make_token_word_resolver(nrm, universe),
            "token + bigram": make_token_full_resolver(vtri, universe),
        }

        # full-scan baseline: run the regex over every document
        scan = []
        for _, rx, _ in plans:
            t = time.perf_counter()
            for d in docs:
                rx.search(d)
            scan.append((time.perf_counter() - t) * 1e3)
        filterable = [bool(g) for _, _, g in plans]
        fsub = [x for x, f in zip(scan, filterable) if f]
        row = {"N": N, "MB": nb / 1e6, "method": "full scan", "build_s": 0.0, "postings": 0,
               "p50": st.median(scan), "p90": pct(scan, 0.9), "mean": st.mean(scan),
               "filter_p50": 0.0, "mean_f": st.mean(fsub), "p50_f": st.median(fsub),
               "p90_f": pct(fsub, 0.9)}
        row["qps"] = 1000.0 / row["mean"]
        out.append(row)
        print(f"  {'full scan':<20} build    0.0s  p50 {row['p50']:8.2f} ms  "
              f"p90 {row['p90']:8.2f}  {row['qps']:7.1f} QPS  |  "
              f"filterable-only p50 {row['p50_f']:7.2f}", flush=True)

        for name, resolve in methods.items():
            filt, tot = [], []
            for _, rx, groups in plans:
                t = time.perf_counter()
                cand, _ = and_or(groups, resolve, universe) if groups else (universe, 0)
                f = time.perf_counter() - t
                for d in cand:
                    rx.search(docs[d])
                tot.append((time.perf_counter() - t) * 1e3)
                filt.append(f * 1e3)
            tf = [x for x, f in zip(tot, filterable) if f]
            r = {"N": N, "MB": nb / 1e6, "method": name, "build_s": builds[name],
                 "postings": sizes[name], "p50": st.median(tot), "p90": pct(tot, 0.9),
                 "mean": st.mean(tot), "filter_p50": st.median(filt),
                 "mean_f": st.mean(tf), "p50_f": st.median(tf), "p90_f": pct(tf, 0.9)}
            r["qps"] = 1000.0 / r["mean"]
            r["qps_f"] = 1000.0 / r["mean_f"]
            r["speedup"] = row["mean"] / r["mean"]
            r["speedup_f"] = row["mean_f"] / r["mean_f"]
            out.append(r)
            print(f"  {name:<20} build {r['build_s']:6.1f}s  p50 {r['p50']:8.2f} ms  "
                  f"p90 {r['p90']:8.2f}  {r['qps']:7.1f} QPS  {r['speedup']:5.2f}x  |  "
                  f"filterable-only p50 {r['p50_f']:7.2f} {r['speedup_f']:6.1f}x",
                  flush=True)
        print("", flush=True)
        del idx, uni, bi, nrm, vtri
        gc.collect()

    json.dump(out, open(f"{DATA}/latency.json", "w"))
    print("wrote latency.json", flush=True)


if __name__ == "__main__":
    sys.exit(main())

"""Scaling tables from latency.json: build time, postings, latency, QPS.

Reports the aggregate AND the filterable-only slice, because the aggregate is
dominated by patterns no index can help and hides the whole effect.

Run from the repo root:  python experiments/regex-filter/bench_report.py
"""
import json
import math
import sys
from collections import defaultdict

DATA = "experiments/regex-filter/data"
ORDER = ["full scan", "dense trigram", "TopK sparse", "token word-aligned", "token + bigram"]


def slope(xs, ys):
    """Fit y = c * x^k, return k. k=1 is linear in corpus size."""
    lx = [math.log(x) for x in xs]
    ly = [math.log(y) for y in ys if y > 0]
    if len(ly) != len(lx) or len(lx) < 2:
        return float("nan")
    mx, my = sum(lx) / len(lx), sum(ly) / len(ly)
    num = sum((a - mx) * (b - my) for a, b in zip(lx, ly))
    den = sum((a - mx) ** 2 for a in lx)
    return num / den if den else float("nan")


def main():
    rows = json.load(open(f"{DATA}/latency.json"))
    scan = {r["N"]: r for r in rows if r["method"] == "full scan"}
    for r in rows:                     # fill derived fields for every row
        r["qps_f"] = 1000.0 / r["mean_f"]
        r["speedup_f"] = scan[r["N"]]["mean_f"] / r["mean_f"]
        r["speedup"] = scan[r["N"]]["mean"] / r["mean"]
    by = defaultdict(dict)
    for r in rows:
        by[r["method"]][r["N"]] = r
    sizes = sorted({r["N"] for r in rows})

    print(f"BUILD TIME (s) and INDEX POSTINGS by corpus size\n", flush=True)
    print(f"  {'method':<20} " + " ".join(f"{n:>12,}" for n in sizes) + "   growth", flush=True)
    for m in ORDER[1:]:
        d = by.get(m, {})
        if not d:
            continue
        b = [d[n]["build_s"] for n in sizes if n in d]
        print(f"  {m:<20} " + " ".join(f"{d[n]['build_s']:>12.1f}" for n in sizes if n in d)
              + f"   O(N^{slope(sizes, b):.2f})", flush=True)
    print(flush=True)
    for m in ORDER[1:]:
        d = by.get(m, {})
        if not d:
            continue
        p = [d[n]["postings"] for n in sizes if n in d]
        print(f"  {m:<20} " + " ".join(f"{d[n]['postings']:>12,}" for n in sizes if n in d)
              + f"   O(N^{slope(sizes, p):.2f})", flush=True)

    for tag, k50, k90, kq, ks in [("ALL PATTERNS", "p50", "p90", "qps", "speedup"),
                                  ("FILTERABLE ONLY", "p50_f", "p90_f", "qps_f", "speedup_f")]:
        print(f"\n\n{tag}: end-to-end latency ms (filter + verify)\n", flush=True)
        print(f"  {'method':<20} " + " ".join(f"{n:>12,}" for n in sizes) + "   growth", flush=True)
        for m in ORDER:
            d = by.get(m, {})
            if not d:
                continue
            v = [d[n][k50] for n in sizes if n in d]
            print(f"  {m:<20} " + " ".join(f"{d[n][k50]:>12.2f}" for n in sizes if n in d)
                  + f"   O(N^{slope(sizes, v):.2f})", flush=True)
        print(f"\n  p90 ms", flush=True)
        for m in ORDER:
            d = by.get(m, {})
            if d:
                print(f"  {m:<20} " + " ".join(f"{d[n][k90]:>12.2f}" for n in sizes if n in d), flush=True)
        print(f"\n  QPS (single core)", flush=True)
        for m in ORDER:
            d = by.get(m, {})
            if d:
                print(f"  {m:<20} " + " ".join(f"{d[n][kq]:>12.1f}" for n in sizes if n in d), flush=True)
        print(f"\n  speedup vs full scan", flush=True)
        for m in ORDER[1:]:
            d = by.get(m, {})
            if d:
                print(f"  {m:<20} " + " ".join(f"{d[n][ks]:>11.1f}x" for n in sizes if n in d), flush=True)


if __name__ == "__main__":
    sys.exit(main())

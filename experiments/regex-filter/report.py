"""Break the benchmark results down per query class, with concrete patterns.

An aggregate on its own is not usable, so every bucket prints the actual
regexes that live in it.

Run from the repo root:  python experiments/regex-filter/report.py
"""
import json
import statistics as st
import sys
from collections import defaultdict

DATA = "experiments/regex-filter/data"
METHODS = ["dense trigram", "TopK sparse", "token word-aligned", "token + bigram"]


def main():
    rows = json.load(open(f"{DATA}/results.json"))
    N = max(r["truth"] for r in rows) and None
    ndocs = 4000
    print(f"{len(rows)} patterns, {ndocs:,} docs\n", flush=True)

    # soundness first: a method that drops a true match is broken, not tuned
    print("SOUNDNESS (recall must be 1.000 everywhere)", flush=True)
    for m in METHODS:
        bad = [r for r in rows if not r[m][2]]
        print(f"  {m:22} {len(rows)-len(bad)}/{len(rows)} sound", flush=True)
        for r in bad[:3]:
            print(f"      LEAK {r['pat']!r}  truth={r['truth']} cand={r[m][0]}", flush=True)

    byc = defaultdict(list)
    for r in rows:
        byc[r["cls"]].append(r)

    print(f"\nCANDIDATES SCANNED, mean % of corpus (lower is better)", flush=True)
    hdr = f"  {'class':<14} {'n':>4} {'true':>6} " + " ".join(f"{m[:13]:>14}" for m in METHODS)
    print(hdr, flush=True)
    for cls in ["word-aligned", "sub-word", "alternation", "no-literal"]:
        rs = byc.get(cls, [])
        if not rs:
            continue
        truth = st.mean(r["truth"] for r in rs)
        cells = []
        for m in METHODS:
            cells.append(f"{100*st.mean(r[m][0] for r in rs)/ndocs:13.1f}%")
        print(f"  {cls:<14} {len(rs):>4} {truth:>6.0f} " + " ".join(cells), flush=True)

    print(f"\nFALLBACK RATE, % of patterns with no usable constraint", flush=True)
    for cls in ["word-aligned", "sub-word", "alternation", "no-literal"]:
        rs = byc.get(cls, [])
        if not rs:
            continue
        cells = [f"{100*sum(1 for r in rs if not r[m][1])/len(rs):13.1f}%" for m in METHODS]
        print(f"  {cls:<14} {len(rs):>4} {'':>6} " + " ".join(cells), flush=True)

    print(f"\nFALSE POSITIVES, candidates / true matches (1.0 = perfect)", flush=True)
    for cls in ["word-aligned", "sub-word", "alternation"]:
        rs = [r for r in byc.get(cls, []) if r["truth"] > 0]
        if not rs:
            continue
        cells = [f"{st.median(r[m][0]/r['truth'] for r in rs):13.1f}x" for m in METHODS]
        print(f"  {cls:<14} {len(rs):>4} {'':>6} " + " ".join(cells), flush=True)

    # concrete rows: where token+bigram beats and loses to sparse grams
    print(f"\nWHERE token+bigram BEATS TopK sparse (biggest candidate gaps)", flush=True)
    d = [r for r in rows if r["TopK sparse"][1] or r["token + bigram"][1]]
    d.sort(key=lambda r: r["token + bigram"][0] - r["TopK sparse"][0])
    for r in d[:6]:
        print(f"  {r['pat']!r:44} truth {r['truth']:>4}  sparse {r['TopK sparse'][0]:>5}  "
              f"token+bi {r['token + bigram'][0]:>5}", flush=True)
    print(f"\nWHERE TopK sparse BEATS token+bigram", flush=True)
    for r in d[-6:]:
        print(f"  {r['pat']!r:44} truth {r['truth']:>4}  sparse {r['TopK sparse'][0]:>5}  "
              f"token+bi {r['token + bigram'][0]:>5}", flush=True)


if __name__ == "__main__":
    sys.exit(main())

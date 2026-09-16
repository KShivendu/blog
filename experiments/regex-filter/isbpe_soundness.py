"""Does ISBPE dual make the SIMPLE token lookup sound?

The adjacency index exists because BPE gives a word a different id depending on
what precedes it, so looking the query's own tokens up drops real matches. If
ISBPE dual really gives a word one identity everywhere, that lookup should
become sound, and the adjacency index (68% of the postings at 128k docs) would
not be needed for word-aligned literals.

This checks recall directly: for every mined agent pattern, does the naive
token lookup return every document the regex really matches?

Run from the repo root:
  python3 experiments/regex-filter/isbpe_soundness.py
"""
import json
import re
import sys
from collections import defaultdict

sys.path.insert(0, "/home/kshivendu/projects/research/tokenizer/isbpe/src")
sys.path.insert(0, "experiments/regex-filter")

from literals import required

DATA = "experiments/regex-filter/data"
NDOCS = 3000
NPAT = 300
WORD = re.compile(r"\w+")


def run(name, encode, docs, plans):
    uni = defaultdict(set)
    for d, t in enumerate(docs):
        for i in set(encode(t)):
            uni[i].add(d)
    universe = set(range(len(docs)))

    sound = checked = fellback = 0
    leaks = []
    for pat, rx, groups in plans:
        truth = {d for d, t in enumerate(docs) if rx.search(t)}
        if not truth:
            continue
        cand, used = universe, False
        for g in groups:
            sub, ok = set(), True
            for lit in g:
                ids = encode(lit)
                if not ids:
                    ok = False
                    break
                r = universe
                for i in ids:
                    r = r & uni.get(i, set())
                sub |= r
            if ok:
                cand = cand & sub
                used = True
        checked += 1
        if not used:
            fellback += 1
            continue
        if truth <= cand:
            sound += 1
        else:
            leaks.append((pat, len(truth), len(truth - cand)))
    print(f"\n=== {name}", flush=True)
    print(f"  patterns with a match: {checked}   no constraint: {fellback}", flush=True)
    n = checked - fellback
    print(f"  naive token lookup sound on {sound}/{n} "
          f"({100*sound/max(n,1):.1f}%)", flush=True)
    for p, t, miss in leaks[:5]:
        print(f"      LEAK {p!r:36} {miss}/{t} matches dropped", flush=True)
    return sound, n


def main():
    docs = json.load(open(f"{DATA}/docs_test.json"))[:NDOCS]
    pats = [p for p, _ in json.load(open(f"{DATA}/agent_patterns.json"))]
    pats = [p.replace(r"\|", "|").replace(r"\(", "(").replace(r"\)", ")") for p in pats]
    plans = []
    for p in pats:
        try:
            plans.append((p, re.compile(p), required(p, 3)))
        except re.error:
            pass
    plans = [x for x in plans if x[2]][:NPAT]
    print(f"{len(docs):,} docs, {len(plans)} agent patterns with a usable literal", flush=True)

    import tiktoken

    enc = tiktoken.get_encoding("o200k_base")
    run("BPE o200k, naive token lookup",
        lambda s: enc.encode(s, disallowed_special=()), docs, plans)

    from isbpe import ISBPE

    corpus = "\n".join(docs).encode("utf-8")
    for mode in ("single", "dual"):
        print(f"\ntraining ISBPE {mode} on {len(corpus)/1e6:.1f} MB ...", flush=True)
        tok = ISBPE(mode=mode).train(corpus, vocab_size=32768)
        run(f"ISBPE {mode}, naive token lookup", lambda s, tk=tok: tk.encode(s), docs, plans)


if __name__ == "__main__":
    sys.exit(main())

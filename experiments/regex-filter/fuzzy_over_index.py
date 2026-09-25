"""Can the regex filter's index answer typo search, with nothing added?

The chunk path already answers "which documents contain this 3-character
sequence", which is the primitive classic q-gram typo search runs on. Chop the
misspelled word into chunks and require MOST of them instead of all: a
one-character edit can damage at most q chunks, so the rest still find the
document.

This measures recall and selectivity of exactly that, over the same vocab
sidecar and boundary map the regex filter uses.

Run from the repo root:
  python3 experiments/regex-filter/fuzzy_over_index.py
"""
import json
import random
import re
import statistics as st
import sys
from collections import Counter, defaultdict

sys.path.insert(0, "experiments/regex-filter")

from indexes import ENC
from literals import required

DATA = "experiments/regex-filter/data"
NDOCS = int(__import__("os").environ.get("NDOCS", 3000))
MINLEN = 6          # q-gram floor is only interesting above the pad width
AL = "abcdefghijklmnopqrstuvwxyz_"


def build(docs):
    """vocab sidecar (chunk inside one token) + boundary map (chunk across two)."""
    side = defaultdict(set)
    for i in range(ENC.n_vocab):
        try:
            bs = ENC.decode_single_token_bytes(i)
        except Exception:
            continue
        for j in range(len(bs) - 2):
            side[bs[j : j + 3]].add(i)
    uni, vtri = defaultdict(set), defaultdict(set)
    for d, t in enumerate(docs):
        ids = ENC.encode(t, disallowed_special=())
        for i in set(ids):
            uni[i].add(d)
        parts = [ENC.decode_single_token_bytes(i) for i in ids]
        flat = b"".join(parts)
        pos = 0
        for p in parts[:-1]:
            pos += len(p)
            for k in (pos - 2, pos - 1):
                if 0 <= k <= len(flat) - 3:
                    vtri[flat[k : k + 3]].add(d)
    for g, tids in side.items():
        s = set()
        for i in tids:
            s |= uni.get(i, set())
        if s:
            vtri[g] |= s
    return vtri


def typo(w, rng):
    k = rng.randrange(3)
    i = rng.randrange(len(w))
    if k == 0:
        return w[:i] + rng.choice(AL) + w[i + 1 :]
    if k == 1:
        return w[:i] + w[i + 1 :]
    return w[:i] + rng.choice(AL) + w[i:]


def main():
    rng = random.Random(5)
    docs = json.load(open(f"{DATA}/docs_test.json"))[:NDOCS]
    vtri = build(docs)
    print(f"{len(docs):,} docs, {len(vtri):,} virtual trigrams "
          f"(the SAME index the regex filter uses)\n", flush=True)

    pats = [p for p, _ in json.load(open(f"{DATA}/agent_patterns.json"))]
    pats = [p.replace(r"\|", "|").replace(r"\(", "(").replace(r"\)", ")") for p in pats]
    lits = set()
    for p in pats:
        try:
            g = required(p, 3)
        except re.error:
            continue
        for grp in g:
            for l in grp:
                if re.fullmatch(rf"\w{{{MINLEN},}}", l):
                    lits.add(l)

    rows = []
    for w in sorted(lits):
        truth = {d for d, t in enumerate(docs) if w in t}
        if not truth:
            continue
        t = typo(w, rng)
        if t == w:
            continue
        b = t.encode()
        gs = [b[i : i + 3] for i in range(len(b) - 2)]
        need = max(1, len(gs) - 3)          # one edit damages at most 3 chunks
        c = Counter()
        for g in set(gs):
            for d in vtri.get(g, ()):
                c[d] += 1
        cand = {d for d, n in c.items() if n >= need}
        rows.append((w, t, len(truth), len(truth & cand), len(cand)))

    rec = sum(r[3] for r in rows)
    tot = sum(r[2] for r in rows)
    print(f"typo search over {len(rows)} words", flush=True)
    print(f"  recall of docs holding the CORRECT word  {rec:,}/{tot:,} = "
          f"{100*rec/tot:.1f}%", flush=True)
    print(f"  candidates  p50 {st.median([r[4] for r in rows]):.0f}  "
          f"mean {st.mean([r[4] for r in rows]):.0f}  of {len(docs):,} docs", flush=True)
    print(f"  exact-search baseline is p50 1 candidate\n", flush=True)
    for w, t, tr, fo, ca in rows[:6]:
        print(f"    {w:<20} typo {t:<20} found {fo}/{tr}  cand {ca}", flush=True)


if __name__ == "__main__":
    sys.exit(main())

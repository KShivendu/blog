"""A sub-word literal can sit inside one token or straddle a boundary.
Enumerate every alignment from the vocab alone, then prune with a corpus
token-bigram index, then check against alignments that really occur.

Run from the repo root:  python experiments/regex-filter/arm_plan.py
"""
import sys
import bisect
import re
from collections import Counter, defaultdict

from common import ENC, affix_maps, repo_corpus, vocab_strings

LITERALS = ["keniz", "ization", "veal", "_id", "earch", "quantum", "belvid", "xylo", "gRPC"]


def contains(toks, sub):
    return {i for i, s in toks.items() if sub in s}


def enumerate_arms(toks, sw, ew, exact, lit, maxk=3):
    """arm = AND of conjuncts; lit = suffix(t1) + t2..t(k-1) + prefix(tk)."""
    arms = []
    S = contains(toks, lit)
    if S:
        arms.append(("inside", [len(S)]))
    m = len(lit)
    for a in range(1, m):
        A, B = ew.get(lit[:a], set()), sw.get(lit[a:], set())
        if A and B:
            arms.append((f"{lit[:a]}|{lit[a:]}", [len(A), len(B)]))
    if maxk >= 3:
        for a in range(1, m):
            for b in range(a + 1, m):
                if lit[a:b] not in exact:
                    continue
                A, B = ew.get(lit[:a], set()), sw.get(lit[b:], set())
                if A and B:
                    arms.append((f"{lit[:a]}|{lit[a:b]}|{lit[b:]}", [len(A), 1, len(B)]))
    return arms


def main():
    toks = vocab_strings()
    sw, ew = affix_maps(toks)
    exact = {s: i for i, s in toks.items()}

    print("1. vocab-only enumeration (no corpus knowledge)", flush=True)
    for lit in LITERALS:
        arms = enumerate_arms(toks, sw, ew, exact, lit)
        tot = sum(sum(a[1]) for a in arms)
        print(f"  {lit!r:10} {len(arms):3} arms, {tot:>7,} posting lists to open", flush=True)

    # Build the corpus token-bigram index.
    docs = repo_corpus()
    uni, bi, adj = defaultdict(set), defaultdict(set), set()
    for d, txt in enumerate(docs):
        ids = ENC.encode(txt, disallowed_special=())
        for i in ids:
            uni[i].add(d)
        for a, b in zip(ids, ids[1:]):
            bi[(a, b)].add(d)
            adj.add((a, b))
    up = sum(len(v) for v in uni.values())
    bp = sum(len(v) for v in bi.values())
    print(f"\n2. corpus: {len(docs)} docs", flush=True)
    print(f"  unigram: {len(uni):,} terms  {up:,} postings  mean df {up/len(uni):.1f}", flush=True)
    print(f"  bigram : {len(bi):,} terms  {bp:,} postings  mean df {bp/len(bi):.1f}", flush=True)
    print(f"  postings ratio: {bp/up:.2f}x\n", flush=True)

    print("3. arm pruning: enumerated (A,B) pairs vs pairs that really occur adjacently", flush=True)
    for lit in LITERALS:
        tot_v = tot_r = 0
        for a in range(1, len(lit)):
            A, B = ew.get(lit[:a], set()), sw.get(lit[a:], set())
            if not (A and B):
                continue
            tot_v += len(A) * len(B)
            tot_r += sum(1 for x in A for y in B if (x, y) in adj)
        if tot_v:
            print(f"  {lit!r:10} {tot_v:>9,} enumerated -> {tot_r:>4} real  "
                  f"({tot_v/max(tot_r,1):,.0f}x pruning)", flush=True)

    # Which alignments does BPE actually produce on real text?
    corpus = "\n".join(docs)
    ids = ENC.encode(corpus, disallowed_special=())
    strs = [ENC.decode([i]) for i in ids]
    off, pos = [], 0
    for s in strs:
        off.append(pos)
        pos += len(s)
    flat = "".join(strs)
    print("\n4. alignments that actually occur in real text", flush=True)
    for lit in LITERALS:
        c = Counter()
        for m in re.finditer(re.escape(lit), flat):
            a, b = m.start(), m.end()
            t0 = bisect.bisect_right(off, a) - 1
            t1 = bisect.bisect_right(off, b - 1) - 1
            parts = []
            for t in range(t0, t1 + 1):
                ts, te = off[t], off[t] + len(strs[t])
                parts.append(flat[max(ts, a) : min(te, b)])
            c["|".join(parts)] += 1
        if c:
            tot = sum(c.values())
            shown = "  ".join(f"{k} x{v}" for k, v in c.most_common(3))
            print(f"  {lit!r:10} {tot:>5} occurrences, {len(c)} alignments:  {shown}", flush=True)


if __name__ == "__main__":
    sys.exit(main())

"""How well does a bag of BPE tokens survive a one-character typo, versus a
bag of char trigrams? Stratified by word length, because the trigram floor
degenerates on short words and the aggregate hides it.

Run from the repo root:  python experiments/regex-filter/fuzzy_robustness.py
"""
import random
import re
import statistics as st
import sys
from collections import defaultdict

from common import ENC, DICT, ngram_index, trigrams, vocab_strings

AL = "abcdefghijklmnopqrstuvwxyz"


def typo(w, rng):
    k = rng.randrange(4)
    i = rng.randrange(len(w))
    if k == 0:
        return w[:i] + rng.choice(AL) + w[i + 1 :], i, "sub"
    if k == 1:
        return w[:i] + w[i + 1 :], i, "del"
    if k == 2:
        return w[:i] + rng.choice(AL) + w[i:], i, "ins"
    j = min(i, len(w) - 2)
    return w[:j] + w[j + 1] + w[j] + w[j + 2 :], j, "swap"


def J(a, b):
    return len(a & b) / len(a | b) if a | b else 1.0


def main():
    rng = random.Random(7)
    words = {w.strip().lower() for w in open(DICT, encoding="utf-8", errors="ignore")}
    words = [w for w in words if re.fullmatch(r"[a-z]{2,}", w)]
    toks = lambda w: set(ENC.encode(" " + w))

    # --- aggregate, len>=5 (the sample that hid the short-word hole)
    pool = [w for w in words if len(w) >= 5]
    rows = []
    for w in rng.sample(pool, 8000):
        t, pos, kind = typo(w, rng)
        if not t or t == w:
            continue
        a, b = toks(w), toks(t)
        rows.append((w, t, pos / len(w), kind, J(a, b), len(a & b) > 0,
                     J(trigrams(w), trigrams(t)), len(trigrams(w) & trigrams(t)),
                     len(ENC.encode(" " + w)), len(ENC.encode(" " + t))))
    tj = [r[4] for r in rows]
    ta = [r[5] for r in rows]
    cj = [r[6] for r in rows]
    print(f"1. one edit-1 typo, words len>=5, n={len(rows)}", flush=True)
    print(f"  BPE token bag    J={st.mean(tj):.3f} p50={st.median(tj):.3f} "
          f"shares>=1 term {100*sum(ta)/len(ta):.1f}%", flush=True)
    print(f"  char trigram bag J={st.mean(cj):.3f} p50={st.median(cj):.3f} "
          f"shares>=1 term 100.0%", flush=True)
    print(f"  tokens per word: {st.mean([r[8] for r in rows]):.2f} clean -> "
          f"{st.mean([r[9] for r in rows]):.2f} typo\n", flush=True)
    print("  examples with zero token overlap:", flush=True)
    for r in [r for r in rows if not r[5]][:6]:
        print(f"    {r[0]:>14} -> {r[1]:<14} {ENC.encode(' '+r[0])} -> {ENC.encode(' '+r[1])}", flush=True)

    # --- stratified by length: where the trigram floor breaks
    print(f"\n2. shared PADDED trigrams by word length", flush=True)
    print(f"{'len':>4} {'n':>6} {'mean':>6} {'min':>4} {'miss@>=2':>10} {'miss@>=1':>10}", flush=True)
    for L in [2, 3, 4, 5, 6, 8, 10, 14]:
        sub = [w for w in words if (len(w) == L if L < 14 else len(w) >= 14)]
        if len(sub) < 50:
            continue
        sh = []
        for w in rng.sample(sub, min(3000, len(sub))):
            t, _, _ = typo(w, rng)
            if not t or t == w:
                continue
            sh.append(len(trigrams(w) & trigrams(t)))
        m2 = 100 * sum(1 for x in sh if x < 2) / len(sh)
        m1 = 100 * sum(1 for x in sh if x < 1) / len(sh)
        print(f"{L:>4} {len(sh):>6} {st.mean(sh):>6.1f} {min(sh):>4} {m2:>9.1f}% {m1:>9.1f}%", flush=True)
    print("\n  the doc's counterexample:", flush=True)
    for a, b in [("cat", "at"), ("the", "he"), ("qdrant", "qdrent")]:
        print(f"    {a!r} vs {b!r}: {sorted(trigrams(a))} / {sorted(trigrams(b))} "
              f"-> shared {len(trigrams(a)&trigrams(b))} of {len(trigrams(a)|trigrams(b))}", flush=True)

    # --- can vocab-level token expansion recover a typo?
    V = vocab_strings()
    vidx = ngram_index(V, 3)
    def neigh(s):
        if len(s) < 3:
            return set()
        c = set()
        for g in trigrams(s, pad=False):
            c |= vidx[g]
        return {i for i in c if abs(len(V[i]) - len(s)) <= 1}
    rec, sizes = 0, []
    sample = rng.sample(pool, 800)
    for w in sample:
        t, _, _ = typo(w, rng)
        if not t or t == w:
            continue
        want, got = set(ENC.encode(" " + w)), set()
        for i in ENC.encode(" " + t):
            got |= {i} | neigh(V.get(i, ""))
        sizes.append(len(got))
        if want & got:
            rec += 1
    print(f"\n3. token-level fuzzy expansion (expand each typo token to trigram-neighbour tokens)", flush=True)
    print(f"  recall of the correct word's tokens: {100*rec/len(sample):.1f}%   "
          f"mean expansion set {st.mean(sizes):,.0f} tokens", flush=True)


if __name__ == "__main__":
    sys.exit(main())

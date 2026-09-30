"""Soundness tests. A prefilter that drops a real match is a wrong answer, so
these check the two properties the whole benchmark rests on."""
import random
import sys

sys.path.insert(0, "experiments/regex-filter")
import numpy as np
from indexes import _bigram_weights, sparse_grams


def brute(t, amin=3, amax=16):
    b, w = _bigram_weights(t)
    out = set()
    for n in range(amin, amax + 1):
        k = n - 1
        for s in range(0, len(w) - k + 1):
            interior = w[s + 1 : s + k - 1]
            if len(interior) == 0 or (w[s] > interior.max() and w[s + k - 1] > interior.max()):
                out.add(b[s : s + n])
    return out


def main():
    rng = random.Random(0)
    al = "abcdefgh xyz0123"
    bad = 0
    for trial in range(400):
        t = "".join(rng.choice(al) for _ in range(rng.randint(3, 60)))
        if sparse_grams(t) != brute(t):
            bad += 1
            if bad < 3:
                print(f"  MISMATCH on {t!r}", flush=True)
    print(f"1. vectorised == brute force: {400-bad}/400 strings agree", flush=True)

    # The locality invariant: every gram selected from a substring must also be
    # selected when that substring sits inside a longer document.
    misses = 0
    for trial in range(400):
        q = "".join(rng.choice(al) for _ in range(rng.randint(6, 20)))
        pre = "".join(rng.choice(al) for _ in range(rng.randint(0, 30)))
        suf = "".join(rng.choice(al) for _ in range(rng.randint(0, 30)))
        if not (sparse_grams(q) <= sparse_grams(pre + q + suf)):
            misses += 1
            if misses < 3:
                print(f"  LEAK: {q!r} in {pre!r}+q+{suf!r}", flush=True)
    print(f"2. covering(q) subset of all(d): {400-misses}/400 embeddings hold", flush=True)
    return 1 if (bad or misses) else 0


if __name__ == "__main__":
    sys.exit(main())

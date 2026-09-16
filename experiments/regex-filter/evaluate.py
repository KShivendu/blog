"""Run every filter method over the mined regexes and measure how many
documents each one hands the verifier.

Ground truth is re.search(pattern, doc), so recall MUST come out at 1.000 for
every method. Anything less is a soundness bug, not a tuning choice.

Run from the repo root:  python experiments/regex-filter/evaluate.py
"""
import json
import os
import random
import re
import sys
import time
from collections import defaultdict

sys.path.insert(0, "experiments/regex-filter")

from indexes import (ENC, affix_maps, build_sparse, build_token, build_trigram,
                     build_token_normalized, build_vocab_sidecar, postings,
                     sparse_grams, vocab_strings)
from literals import required

DATA = "experiments/regex-filter/data"
MINLEN = 3
N_PATTERNS = int(os.environ.get("N_PATTERNS", 400))
N_DOCS = int(os.environ.get("N_DOCS", 4000))
WORD = re.compile(r"\w+")


# ---------------------------------------------------------------- plan eval
def and_or(groups, resolve, universe):
    """groups = AND of OR-lists of literals. resolve(lit) -> set|None.
    None means the method has no constraint for that literal."""
    cand, used = universe, 0
    for g in groups:
        sub, ok = set(), True
        for lit in g:
            r = resolve(lit)
            if r is None:
                ok = False
                break
            sub |= r
        if ok:
            cand = cand & sub
            used += 1
    return cand, used


def make_trigram_resolver(idx, universe):
    def f(lit):
        gs = {lit[i : i + 3] for i in range(len(lit) - 2)}
        if not gs:
            return None
        out = universe
        for g in gs:
            out = out & idx.get(g, set())
            if not out:
                break
        return out
    return f


def make_sparse_resolver(idx, universe):
    def f(lit):
        gs = sparse_grams(lit)
        if not gs:
            return None
        out = universe
        for g in gs:
            out = out & idx.get(g, set())
            if not out:
                break
        return out
    return f


def make_token_word_resolver(nrm, universe):
    """Only word runs bounded by a non-word char on BOTH sides inside the
    literal are safe: an edge-touching run may be extended by the document,
    and BPE retokenises the whole word when that happens."""
    def f(lit):
        words = []
        for m in WORD.finditer(lit):
            if m.start() > 0 and m.end() < len(lit):
                words.append(m.group())
        if not words:
            return None
        out = universe
        for w in words:
            ids = ENC.encode(" " + w.lower())
            for i in ids:
                out = out & nrm.get(i, set())
                if not out:
                    return out
        return out
    return f


def make_token_full_resolver(vtri, universe):
    """Virtual char-trigram index: 'docs containing trigram g' resolved through
    the vocab sidecar plus token-bigram adjacency, never stored per document."""
    def f(lit):
        gs = {lit[i : i + 3] for i in range(len(lit) - 2)}
        if not gs:
            return None
        out = universe
        for g in gs:
            out = out & vtri.get(g, set())
            if not out:
                break
        return out
    return f


def classify(pat, groups):
    if not groups:
        return "no-literal"
    if len(groups) == 1 and len(groups[0]) > 1:
        return "alternation"
    lits = [l for g in groups for l in g]
    longest = max(lits, key=len)
    # a literal is "word-aligned" if some word run sits strictly inside it
    for m in WORD.finditer(longest):
        if m.start() > 0 and m.end() < len(longest):
            return "word-aligned"
    return "sub-word"


def main():
    t0 = time.time()
    docs = json.load(open(f"{DATA}/docs_test.json"))[:N_DOCS]
    pats = [p for p, _ in json.load(open(f"{DATA}/patterns.json"))]
    universe = frozenset(range(len(docs)))
    nb = sum(len(d) for d in docs)
    print(f"corpus: {len(docs):,} docs, {nb/1e6:.1f} MB", flush=True)

    rng = random.Random(0)
    pats = rng.sample(pats, min(N_PATTERNS, len(pats)))
    print(f"patterns: {len(pats)} sampled from the mined set\n", flush=True)

    print("building indexes...", flush=True)
    tri = build_trigram(docs)
    print(f"  dense trigram   {len(tri):>9,} terms  {postings(tri):>12,} postings  "
          f"({time.time()-t0:.0f}s)", flush=True)
    spa = build_sparse(docs)
    print(f"  TopK sparse     {len(spa):>9,} terms  {postings(spa):>12,} postings  "
          f"({time.time()-t0:.0f}s)", flush=True)
    uni, bi = build_token(docs)
    nrm = build_token_normalized(docs)
    print(f"  token normalized{len(nrm):>9,} terms  {postings(nrm):>12,} postings", flush=True)
    print(f"  token unigram   {len(uni):>9,} terms  {postings(uni):>12,} postings", flush=True)
    print(f"  token bigram    {len(bi):>9,} terms  {postings(bi):>12,} postings  "
          f"({time.time()-t0:.0f}s)", flush=True)

    # virtual trigram map: vocab sidecar (single token) + bigram boundary
    V = vocab_strings()
    side = build_vocab_sidecar(V, 3)
    print(f"  vocab sidecar   {len(side):>9,} terms  {postings(side):>12,} postings "
          f"(static, not corpus)", flush=True)
    vtri = defaultdict(set)
    for g, tids in side.items():
        s = set()
        for t in tids:
            s |= uni.get(t, set())
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
    print(f"  virtual trigram {len(vtri):>9,} terms (derived, not stored)  "
          f"({time.time()-t0:.0f}s)\n", flush=True)

    methods = {
        "dense trigram": make_trigram_resolver(tri, universe),
        "TopK sparse": make_sparse_resolver(spa, universe),
        "token word-aligned": make_token_word_resolver(nrm, universe),
        "token + bigram": make_token_full_resolver(vtri, universe),
    }

    rows = []
    for n, pat in enumerate(pats, 1):
        try:
            rx = re.compile(pat)
            truth = {d for d, t in enumerate(docs) if rx.search(t)}
        except Exception:
            continue
        groups = required(pat, MINLEN)
        cls = classify(pat, groups)
        lits = [l for g in groups for l in g]
        rec = {"pat": pat, "cls": cls, "truth": len(truth),
               "litlen": max((len(l) for l in lits), default=0), "nlit": len(lits)}
        for name, resolve in methods.items():
            cand, used = and_or(groups, resolve, universe) if groups else (universe, 0)
            rec[name] = (len(cand), used > 0, truth <= cand)
        rows.append(rec)
        if n % 50 == 0:
            print(f"  {n}/{len(pats)} patterns, {time.time()-t0:.0f}s", flush=True)

    json.dump(rows, open(f"{DATA}/results.json", "w"))
    print(f"\ndone, {len(rows)} patterns evaluated in {time.time()-t0:.0f}s", flush=True)


if __name__ == "__main__":
    sys.exit(main())

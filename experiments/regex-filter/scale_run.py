"""Does the trigram advantage survive at scale?

At 8,000 documents four ANDed trigrams are already near-exact, so TopK's longer
grams had nothing left to remove. On a much larger corpus each short gram hits
far more documents, so long grams may start earning their cost. This sweeps
corpus size far enough to find out.

Postings are roaring bitmaps rather than Python sets (~80x less memory), which
is what makes sizes past ~10k documents reachable at all.

Run from the repo root:
  DOCS=500000 python experiments/regex-filter/scale_run.py
"""
import gc
import json
import os
import re
import statistics as st
import sys
import time
from collections import defaultdict

sys.path.insert(0, "experiments/regex-filter")

import numpy as np
from pyroaring import BitMap

from indexes import ENC, _bigram_weights, sparse_grams, vocab_strings, build_vocab_sidecar
from literals import required

DATA = "experiments/regex-filter/data"
MAXDOCS = int(os.environ.get("DOCS", 500_000))
SIZES = [int(x) for x in os.environ.get("SIZES", "8000,32000,128000,512000").split(",")]
NPAT = int(os.environ.get("NPAT", 120))
WORD = re.compile(r"\w+")


def corpus(n):
    """CodeSearchNet functions, all splits, topped up with Java to get past 500k."""
    from datasets import load_dataset
    out = []
    for lang in ["python", "java", "go"]:
        for split in ["train", "test", "validation"]:
            if len(out) >= n:
                return out[:n]
            try:
                d = load_dataset("code-search-net/code_search_net", name=lang,
                                 split=split, streaming=True, trust_remote_code=True)
            except Exception as e:
                print(f"  skip {lang}/{split}: {str(e)[:60]}", flush=True)
                continue
            for r in d:
                s = r.get("whole_func_string")
                if s:
                    out.append(s)
                if len(out) >= n:
                    return out[:n]
            print(f"  {lang}/{split}: corpus now {len(out):,}", flush=True)
    return out


def build_trigram(docs, n=3):
    idx = defaultdict(BitMap)
    for d, t in enumerate(docs):
        b = t.encode("utf-8", "replace")
        a = np.frombuffer(b, dtype=np.uint8).astype(np.uint32)
        if len(a) < n:
            continue
        code = (a[:-2] << 16) | (a[1:-1] << 8) | a[2:]
        for c in np.unique(code):
            idx[int(c)].add(d)
    return idx


def tri_key(s):
    b = s if isinstance(s, bytes) else s.encode("utf-8", "replace")
    return [(b[i] << 16) | (b[i + 1] << 8) | b[i + 2] for i in range(len(b) - 2)]


def build_sparse(docs):
    idx = defaultdict(BitMap)
    for d, t in enumerate(docs):
        for g in sparse_grams(t):
            idx[g].add(d)
    return idx


def build_token(docs, V):
    uni, vtri = defaultdict(BitMap), defaultdict(BitMap)
    bi_terms = set()
    for d, t in enumerate(docs):
        ids = ENC.encode(t, disallowed_special=())
        for i in set(ids):
            uni[i].add(d)
        bi_terms.update(zip(ids, ids[1:]))
        # BYTES, not characters: BPE is a byte-level code, so a multi-byte
        # UTF-8 character can split across two tokens and decoding each token
        # to str turns the partial character into U+FFFD. Walking that
        # reconstruction silently drops documents.
        parts = [ENC.decode_single_token_bytes(i) for i in ids]
        flat = b"".join(parts)
        pos = 0
        for s_ in parts[:-1]:
            pos += len(s_)
            for k in (pos - 2, pos - 1):
                if 0 <= k <= len(flat) - 3:
                    idxk = tri_key(flat[k : k + 3])
                    if idxk:
                        vtri[idxk[0]].add(d)
    return uni, vtri, len(bi_terms)


def main():
    t0 = time.perf_counter()
    print(f"loading up to {MAXDOCS:,} documents...", flush=True)
    docs_all = corpus(MAXDOCS)
    print(f"  {len(docs_all):,} docs, {sum(len(d) for d in docs_all)/1e6:.0f} MB "
          f"({time.perf_counter()-t0:.0f}s)\n", flush=True)

    pats = [p for p, _ in json.load(open(f"{DATA}/agent_patterns.json"))]
    pats = [p.replace(r"\|", "|").replace(r"\(", "(").replace(r"\)", ")") for p in pats]
    plans = []
    for p in pats:
        try:
            plans.append((p, re.compile(p), required(p, 3)))
        except re.error:
            pass
    plans = plans[:NPAT]
    V = vocab_strings()
    side = build_vocab_sidecar(V, 3)
    out = []

    for N in SIZES:
        if N > len(docs_all):
            print(f"skip {N:,}, only {len(docs_all):,} docs available", flush=True)
            continue
        docs = docs_all[:N]
        MB = sum(len(d) for d in docs) / 1e6
        uni_bm = BitMap(range(N))
        print(f"=== {N:,} docs, {MB:.0f} MB", flush=True)

        t = time.perf_counter(); tri = build_trigram(docs); b_tri = time.perf_counter() - t
        n_tri = sum(len(v) for v in tri.values())
        print(f"  dense trigram  build {b_tri:7.1f}s  {n_tri:>12,} postings", flush=True)

        t = time.perf_counter(); spa = build_sparse(docs); b_spa = time.perf_counter() - t
        n_spa = sum(len(v) for v in spa.values())
        print(f"  TopK sparse    build {b_spa:7.1f}s  {n_spa:>12,} postings", flush=True)

        t = time.perf_counter(); uni, vtri, nbi = build_token(docs, V); b_tok = time.perf_counter() - t
        n_uni = sum(len(v) for v in uni.values())
        n_vtri = sum(len(v) for v in vtri.values())
        print(f"  token+bigram   build {b_tok:7.1f}s  {n_uni+n_vtri:>12,} postings "
              f"(uni {n_uni:,} + boundary {n_vtri:,})", flush=True)

        # resolve trigram g through the vocab sidecar, then the boundary map
        side_uni = {}
        for g, tids in side.items():
            k = tri_key(g)
            if not k:
                continue
            bm = BitMap()
            for tk in tids:
                if tk in uni:
                    bm |= uni[tk]
            if len(bm):
                side_uni[k[0]] = bm

        def res_tri(lit):
            ks = tri_key(lit)
            if not ks:
                return None
            out_ = uni_bm
            for k in ks:
                out_ = out_ & tri.get(k, BitMap())
                if not len(out_):
                    break
            return out_

        def res_spa(lit):
            gs = sparse_grams(lit)
            if not gs:
                return None
            out_ = uni_bm
            for g in gs:
                out_ = out_ & spa.get(g, BitMap())
                if not len(out_):
                    break
            return out_

        def res_tok(lit):
            ks = tri_key(lit)
            if not ks:
                return None
            out_ = uni_bm
            for k in ks:
                bm = side_uni.get(k, BitMap()) | vtri.get(k, BitMap())
                out_ = out_ & bm
                if not len(out_):
                    break
            return out_

        methods = {"dense trigram": res_tri, "TopK sparse": res_spa, "token + bigram": res_tok}
        builds = {"dense trigram": b_tri, "TopK sparse": b_spa, "token + bigram": b_tok}
        sizes_ = {"dense trigram": n_tri, "TopK sparse": n_spa, "token + bigram": n_uni + n_vtri}

        scan = []
        for _, rx, _ in plans:
            t = time.perf_counter()
            for d in docs:
                rx.search(d)
            scan.append((time.perf_counter() - t) * 1e3)
        print(f"  {'full scan':<16} p50 {st.median(scan):9.1f} ms   "
              f"{1000/st.mean(scan):8.2f} QPS", flush=True)
        out.append({"N": N, "MB": MB, "method": "full scan", "p50": st.median(scan),
                    "mean": st.mean(scan), "build_s": 0, "postings": 0, "cand": N})

        for name, resolve in methods.items():
            tot, cands, leak = [], [], 0
            for _, rx, groups in plans:
                t = time.perf_counter()
                if groups:
                    cand, ok = uni_bm, False
                    for g in groups:
                        sub, good = BitMap(), True
                        for lit in g:
                            r = resolve(lit)
                            if r is None:
                                good = False
                                break
                            sub |= r
                        if good:
                            cand = cand & sub
                            ok = True
                    if not ok:
                        cand = uni_bm
                else:
                    cand = uni_bm
                for d in cand:
                    rx.search(docs[d])
                tot.append((time.perf_counter() - t) * 1e3)
                cands.append(len(cand))
            r = {"N": N, "MB": MB, "method": name, "build_s": builds[name],
                 "postings": sizes_[name], "p50": st.median(tot), "mean": st.mean(tot),
                 "cand": st.mean(cands)}
            r["speedup"] = out[-len(methods) - 1 if False else 0]["mean"]
            out.append(r)
            print(f"  {name:<16} p50 {r['p50']:9.2f} ms   {1000/r['mean']:8.2f} QPS   "
                  f"{st.mean(scan)/r['mean']:6.1f}x   mean cand {st.mean(cands)/N*100:5.2f}%",
                  flush=True)
        print("", flush=True)
        del tri, spa, uni, vtri, side_uni
        gc.collect()
        json.dump(out, open(f"{DATA}/scale.json", "w"))
    print("wrote scale.json", flush=True)


if __name__ == "__main__":
    sys.exit(main())

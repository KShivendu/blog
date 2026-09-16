"""Size the vocab-level char n-gram index and measure how much of a word's
signal lives inside single tokens versus across token boundaries.

Run from the repo root:  python experiments/regex-filter/vocab_index.py
"""
import statistics as st
import sys

from common import ENC, ngram_index, trigrams, vocab_strings, english_words

def main():
    toks = vocab_strings()
    lens = [len(s) for s in toks.values()]
    print(f"vocab={ENC.n_vocab}  utf8-decodable={len(toks)}", flush=True)
    print(
        f"token char len: mean={st.mean(lens):.2f} p50={st.median(lens)} "
        f"p90={sorted(lens)[int(.9*len(lens))]} max={max(lens)}",
        flush=True,
    )
    print(f"total vocab text = {sum(lens)/1e6:.2f} M chars\n", flush=True)

    for n in (3, 4):
        idx = ngram_index(toks, n)
        post = sum(len(v) for v in idx.values())
        sizes = sorted(len(v) for v in idx.values())
        print(
            f"vocab {n}-gram index: {len(idx):,} distinct  {post:,} postings  "
            f"(~{post*3/1e6:.1f} MB @3B/entry)",
            flush=True,
        )
        print(
            f"  tokens-per-ngram: p50={sizes[len(sizes)//2]} "
            f"p90={sizes[int(.9*len(sizes))]} p99={sizes[int(.99*len(sizes))]} max={sizes[-1]}\n",
            flush=True,
        )

    print("fan-out: how many vocab tokens CONTAIN the literal", flush=True)
    for lit in ["keniz", "ization", "belvid", "veal", "ing", "the", "xylo",
                "quantum", "http", "_id", "utf-8", "gRPC"]:
        hits = [i for i, s in toks.items() if lit in s]
        print(f"  {lit!r:12} -> {len(hits):5} tokens   e.g. {[toks[i] for i in hits[:5]]}", flush=True)

    # How many of a word's trigrams sit inside no single vocab token?
    strad, ntok = [], []
    for w in english_words(5)[::17][:4000]:
        ids = ENC.encode(" " + w)
        ntok.append(len(ids))
        inside = set()
        for p in (ENC.decode([i]) for i in ids):
            inside |= trigrams(p, pad=False)
        allt = trigrams(" " + w, pad=False)
        strad.append(len(allt - inside) / max(len(allt), 1))
    print(
        f"\nstraddle: {100*st.mean(strad):.1f}% of a word's trigrams sit in NO single vocab token "
        f"(mean {st.mean(ntok):.2f} tokens/word)",
        flush=True,
    )

    # Fraction of words with at least one trigram that no single vocab token
    # carries. Use the word's own trigrams, no artificial padding, or the pad
    # itself manufactures trigrams no token could ever hold.
    idx3 = ngram_index(toks, 3)
    orphan = straddled = tot = 0
    for w in english_words(5)[::17][:4000]:
        tot += 1
        gs = trigrams(w, pad=False)
        if any(not idx3.get(g) for g in gs):
            orphan += 1
        ids = ENC.encode(" " + w)
        inside = set()
        for p in (ENC.decode([i]) for i in ids):
            inside |= trigrams(p, pad=False)
        if gs - inside:
            straddled += 1
    print(
        f"words with >=1 trigram in NO vocab token at all: {100*orphan/tot:.1f}%",
        flush=True,
    )
    print(
        f"words with >=1 trigram straddling THIS word's own token boundary: "
        f"{100*straddled/tot:.1f}%",
        flush=True,
    )

if __name__ == "__main__":
    sys.exit(main())

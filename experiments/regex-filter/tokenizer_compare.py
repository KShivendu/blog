"""Does the tokenizer choice change the regex-filter picture?

Everything else in this directory uses o200k_base. Three things decide whether
a tokenizer suits regex prefiltering, and none of them is retrieval quality:

  1. chars per token   -> how many postings the index holds
  2. straddle rate     -> how much work the adjacency index has to carry,
                          since a chunk inside one token needs no adjacency
  3. context stability -> whether the same text tokenises the same way after a
                          space, a dot and an underscore. BPE does not, which
                          is the failure that makes the naive token lookup
                          drop real matches.

Run from the repo root:  python3 experiments/regex-filter/tokenizer_compare.py
"""
import json
import os
import statistics as st
import sys

os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

DATA = "experiments/regex-filter/data"
CONTEXTS = ["def {}(", "self.{}(", "_{}(", " {} ", "({},", "\n{} ="]
PROBES = ["get_user", "tokenize", "parse_config", "WireCut", "belvidere"]


def trigrams(s):
    return {s[i : i + 3] for i in range(len(s) - 2)}


def report(name, encode, decode_pieces):
    docs = json.load(open(f"{DATA}/docs_test.json"))[:1500]
    nchar = sum(len(d) for d in docs)
    ntok = 0
    strad, inside_only = [], 0
    for d in docs[:400]:
        ids = encode(d)
        ntok += len(ids)
    for d in docs[:400]:
        pieces = decode_pieces(d)
        flat = "".join(pieces)
        ins = set()
        for p in pieces:
            ins |= trigrams(p)
        allt = trigrams(flat)
        if allt:
            strad.append(len(allt - ins) / len(allt))
    for d in docs[400:1500]:
        ntok += len(encode(d))

    # context stability: does the same identifier tokenise the same way
    # regardless of what precedes it?
    stable = []
    for probe in PROBES:
        forms = set()
        for c in CONTEXTS:
            text = c.format(probe)
            pieces = decode_pieces(text)
            # the pieces that overlap the probe, as a tuple
            start = text.index(probe)
            end = start + len(probe)
            pos, got = 0, []
            for p in pieces:
                if pos < end and pos + len(p) > start:
                    got.append(p)
                pos += len(p)
            forms.add(tuple(got))
        stable.append((probe, len(forms)))

    cpt = nchar / ntok if ntok else 0
    print(f"\n=== {name}")
    print(f"  chars per token      {cpt:.2f}")
    print(f"  tokens per 1k chars  {1000/cpt:.0f}   (index postings scale with this)")
    print(f"  trigram straddle     {100*st.mean(strad):.1f}%  of chunks sit in NO single token")
    print(f"  context stability    (how many different tokenisations of the same identifier)")
    for probe, k in stable:
        flag = "stable" if k == 1 else f"{k} DIFFERENT forms"
        print(f"      {probe:<14} {flag}")
    return cpt, 100 * st.mean(strad), st.mean(k for _, k in stable)


def main():
    out = {}
    import tiktoken

    enc = tiktoken.get_encoding("o200k_base")
    out["BPE o200k (used everywhere else here)"] = report(
        "BPE o200k_base",
        lambda s: enc.encode(s, disallowed_special=()),
        lambda s: [enc.decode([i]) for i in enc.encode(s, disallowed_special=())],
    )

    from transformers import AutoTokenizer

    for label, model in [("WordPiece bert-base-uncased", "bert-base-uncased"),
                         ("SentencePiece xlm-roberta", "FacebookAI/xlm-roberta-large")]:
        try:
            tk = AutoTokenizer.from_pretrained(model)
        except Exception as e:
            print(f"\n=== {label}\n  SKIP {str(e)[:90]}", flush=True)
            continue
        def enc_ids(s, tk=tk):
            return tk.encode(s, add_special_tokens=False)
        def pieces(s, tk=tk):
            # convert back to surface text so trigram maths is comparable
            ids = tk.encode(s, add_special_tokens=False)
            return [tk.decode([i]) for i in ids]
        out[label] = report(label, enc_ids, pieces)

    print("\n" + "=" * 62)
    print(f"{'tokenizer':<34}{'chars/tok':>10}{'straddle':>10}{'forms':>8}")
    for k, (c, s_, f) in out.items():
        print(f"{k:<34}{c:>10.2f}{s_:>9.1f}%{f:>8.1f}")


if __name__ == "__main__":
    sys.exit(main())

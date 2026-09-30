"""Would ISBPE's implicit-space scheme help the regex filter?

The failure that makes a naive token lookup unsound is that BPE gives a word a
different id depending on what precedes it: " get" after a space, ".get" after
a dot, "get" after an underscore. ISBPE marks the ABSENCE of a space on the
left-hand token instead, so a word is supposed to keep one identity everywhere.

Three things decide whether that helps here:
  1. losslessness   - the pieces must reassemble to the original bytes, or the
                      derived chunk map is a map of text no document contains
  2. word identity  - how many distinct forms one identifier takes across
                      different surrounding contexts
  3. straddle       - what share of chunks still cross a token boundary, which
                      is the work the adjacency index has to carry

Run from the repo root:
  python3 experiments/regex-filter/isbpe_check.py
"""
import json
import statistics as st
import sys

sys.path.insert(0, "/home/kshivendu/projects/research/tokenizer/isbpe/src")

DATA = "experiments/regex-filter/data"
CONTEXTS = ["def {}(", "self.{}(", "_{}(", " {} ", "({},", "\n{} ="]
PROBES = ["get_user", "tokenize", "parse_config", "WireCut", "belvidere"]


def trigrams_b(b):
    return {b[i : i + 3] for i in range(len(b) - 2)}


def analyse(name, pieces_of, encode):
    docs = json.load(open(f"{DATA}/docs_test.json"))[:400]
    nchar = sum(len(d) for d in docs)
    ntok = 0
    lossless = 0
    strad = []
    for d in docs:
        parts = pieces_of(d)
        ntok += len(parts)
        if b"".join(parts) == d.encode("utf-8"):
            lossless += 1
        flat = b"".join(parts)
        inside = set()
        for p in parts:
            inside |= trigrams_b(p)
        allt = trigrams_b(flat)
        if allt:
            strad.append(len(allt - inside) / len(allt))

    forms = []
    for probe in PROBES:
        seen = set()
        for c in CONTEXTS:
            text = c.format(probe)
            ids = encode(text)
            parts = pieces_of(text)
            start = text.encode("utf-8").index(probe.encode())
            end = start + len(probe)
            pos, got = 0, []
            for i, p in enumerate(parts):
                if pos < end and pos + len(p) > start:
                    got.append(ids[i])
                pos += len(p)
            seen.add(tuple(got))
        forms.append((probe, len(seen)))

    print(f"\n=== {name}", flush=True)
    print(f"  lossless round-trip   {lossless}/{len(docs)} documents", flush=True)
    print(f"  chars per token       {nchar/ntok:.2f}", flush=True)
    print(f"  trigram straddle      {100*st.mean(strad):.1f}%", flush=True)
    print("  distinct id sequences for one identifier across 6 contexts:", flush=True)
    for p, k in forms:
        print(f"      {p:<14} {k}{'  <- one identity' if k == 1 else ''}", flush=True)
    return st.mean(k for _, k in forms)


def main():
    docs = json.load(open(f"{DATA}/docs_test.json"))
    corpus = "\n".join(docs[:6000]).encode("utf-8")
    print(f"training corpus: {len(corpus)/1e6:.1f} MB of Python", flush=True)

    import tiktoken

    enc = tiktoken.get_encoding("o200k_base")
    a = analyse(
        "BPE o200k_base (what the benchmark uses)",
        lambda s: [enc.decode_single_token_bytes(i) for i in enc.encode(s, disallowed_special=())],
        lambda s: enc.encode(s, disallowed_special=()),
    )

    from isbpe import ISBPE

    def surface(tk, ids):
        """Surface bytes per token, with the implicit space folded onto the
        piece that follows it, mirroring ISBPE.decode exactly. Without this the
        pieces do not reassemble and every chunk near a space is wrong."""
        out, prev_right, prev_ws = [], False, False
        for i, t in enumerate(ids):
            b = tk[t].bytes
            lead = b" " if (i and not tk[t].no_space_before and not prev_right and not prev_ws) else b""
            out.append(lead + b)
            prev_right = tk[t].no_space_after
            prev_ws = bool(b) and b.strip() == b""
        return out

    res = {}
    for mode in ("single", "dual"):
        print(f"\ntraining ISBPE {mode}, V=32768 ...", flush=True)
        tok = ISBPE(mode=mode).train(corpus, vocab_size=32768)
        res[mode] = analyse(
            f"ISBPE {mode}",
            lambda s, tk=tok: surface(tk, tk.encode(s)),
            lambda s, tk=tok: tk.encode(s),
        )
    print("\n" + "=" * 58)
    print(f"mean distinct forms per identifier (1.0 is perfect)")
    print(f"  BPE o200k     {a:.1f}")
    for m, v in res.items():
        print(f"  ISBPE {m:<7} {v:.1f}")


if __name__ == "__main__":
    sys.exit(main())

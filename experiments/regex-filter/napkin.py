"""Storage and latency model for regex prefiltering: TopK sparse byte grams
versus token unigram+bigram postings. Constants from sirupsen/napkin-math.

Run from the repo root:  python experiments/regex-filter/napkin.py
"""
import sys

G, M, K = 1e9, 1e6, 1e3

DOCS, DOC_B = 10 * M, 2 * K
CORPUS = DOCS * DOC_B
BPT = 4.0                       # bytes per o200k token, English/code
TOK_PER_DOC = DOC_B / BPT
TOKENS = DOCS * TOK_PER_DOC

TRAVERSE = 250 * M              # postings/s decoded, one core
NVME = 1 * G                    # B/s random 8 KB reads at queue depth
SEQ_NVME = 3 * G
REGEX = 1 * G                   # RE2 with a literal prefilter
REGEX_SLOW = 100 * M            # no usable prefilter
DECODE = 2 * G                  # BPE detokenize


def idx(name, per_doc, bytes_per_posting):
    p = per_doc * DOCS
    b = p * bytes_per_posting
    print(f"  {name:34} {p/G:6.1f} G postings  {b/G:6.1f} GB  {b/CORPUS:5.2f}x corpus", flush=True)
    return b


def q(name, postings, cands, note="", verify=REGEX, decode=False):
    t_trav = postings / TRAVERSE
    bc = cands * DOC_B
    t_fetch, t_dec, t_ver = bc / NVME, (bc / DECODE if decode else 0), bc / verify
    tot = t_trav + t_fetch + t_dec + t_ver
    dec = f"dec {t_dec*1e3:5.1f} | " if decode else ""
    print(f"  {name:30} trav {t_trav*1e3:6.1f} ms | fetch {t_fetch*1e3:6.1f} | {dec}"
          f"verify {t_ver*1e3:6.1f} = {tot*1e3:7.1f} ms  ({cands/K:.0f}k cands){note}", flush=True)
    return tot


def main():
    print(f"corpus {CORPUS/G:.0f} GB, {DOCS/M:.0f}M docs x {DOC_B/K:.0f} KB, {TOKENS/G:.1f}G tokens\n", flush=True)
    print("INDEX STORAGE", flush=True)
    topk = idx("TopK sparse byte grams (~2L)", 2 * DOC_B * 0.75, 2.5)
    uni = idx("token unigram", TOK_PER_DOC * 0.70, 1.5)
    bi = idx("token bigram (1.6x uni postings)", TOK_PER_DOC * 0.70 * 1.6, 2.5)
    print(f"  {'vocab 3-gram sidecar (static)':34} {'':>14}   0.002 GB   ~0", flush=True)
    print(f"\n  TopK {topk/G:.0f} GB  vs  token {(uni+bi)/G:.0f} GB  -> {topk/(uni+bi):.1f}x smaller\n", flush=True)

    print("QUERY LATENCY (single core)", flush=True)
    print(f"  full scan baseline: {CORPUS/REGEX + CORPUS/SEQ_NVME:.1f} s\n", flush=True)

    print("A. word-aligned  /colou?r of the (sky|sea)/   ~20k true matches", flush=True)
    a1 = q("TopK sparse grams", 2.2 * M, 20 * K)
    a2 = q("token unigram+bigram", 1.05 * M, 20 * K, decode=True)
    print(f"     ratio {a1/a2:.2f}x\n", flush=True)

    print("B. rare literal  /belvidere/   2 true matches", flush=True)
    b1 = q("TopK sparse grams", 500, 5)
    b2 = q("token word-tuple", 2, 2, decode=True)
    print(f"     both sub-millisecond\n", flush=True)

    print("C. sub-word  /keniz/   5k true matches", flush=True)
    c1 = q("TopK trigrams ken,eni,niz", 550 * K, 40 * K, "  8x false-pos")
    c2 = q("token vocab-gram + bigram", 350 * K, 6 * K, "  1.2x false-pos", decode=True)
    print(f"     ratio {c1/c2:.2f}x\n", flush=True)

    print("D. wildcard-heavy  /[a-z]{3}[0-9]+/   no usable literal", flush=True)
    print(f"  both fall back to scan: {CORPUS/REGEX_SLOW:.0f} s (or {CORPUS/REGEX:.0f} s if prefilterable)", flush=True)
    print(f"  token payload is {CORPUS*(2.5/BPT)/G:.0f} GB not {CORPUS/G:.0f} GB, "
          f"so scan I/O is {(1-2.5/BPT)*100:.0f}% cheaper", flush=True)


if __name__ == "__main__":
    sys.exit(main())

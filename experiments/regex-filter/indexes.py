"""The five filter indexes under test, all built over the same corpus.

Every index must be SOUND: if a document matches the regex, the index must put
it in the candidate set. Extra candidates are fine, a missing one is a bug and
the evaluator checks recall to catch exactly that.
"""
import zlib
from collections import defaultdict

import numpy as np
import tiktoken
from scipy.ndimage import maximum_filter1d

ENC = tiktoken.get_encoding("o200k_base")


# --------------------------------------------------------------------------
# 1. dense char trigrams
# --------------------------------------------------------------------------
def build_trigram(docs, n=3):
    idx = defaultdict(set)
    for d, t in enumerate(docs):
        for i in range(len(t) - n + 1):
            idx[t[i : i + n]].add(d)
    return idx


# --------------------------------------------------------------------------
# 2. TopK sparse byte grams (CRC32 content-defined selection)
# --------------------------------------------------------------------------
_CRC_LUT = np.array([zlib.crc32(i.to_bytes(2, "little")) for i in range(1 << 16)],
                    dtype=np.uint32)


def _bigram_weights(t):
    """CRC32 weight for every adjacent byte pair. Content-defined, so the
    weight of a pair is the same wherever that pair appears."""
    b = t.encode("utf-8", "replace")
    a = np.frombuffer(b, dtype=np.uint8).astype(np.uint32)
    if len(a) < 2:
        return b, np.zeros(0, dtype=np.uint32)
    return b, _CRC_LUT[(a[:-1] << 8) | a[1:]]


def sparse_grams(t, amin=3, amax=16):
    """A gram of length n spans k = n-1 bigrams, w[s .. s+k-1]. Select it when
    both boundary bigrams (w[s], w[s+k-1]) outweigh every interior one
    (w[s+1 .. s+k-2]). k=2 has no interior, so every trigram is selected.

    Selection reads only bigrams inside the gram, which is what makes a gram
    chosen from a query literal also chosen inside any document holding it.
    """
    b, w = _bigram_weights(t)
    L = len(w)
    out = set()
    if L == 0:
        return out
    for n in range(amin, amax + 1):
        k = n - 1
        if k > L:
            break
        starts = np.arange(L - k + 1)
        sel = (w[starts] > 0) if k == 2 else None
        if k == 2:
            sel = np.ones(len(starts), dtype=bool)
        else:
            m = k - 2                      # interior width
            win = np.lib.stride_tricks.sliding_window_view(w, m).max(axis=1)
            imax = win[starts + 1]         # max of w[s+1 : s+1+m]
            sel = (w[starts] > imax) & (w[starts + k - 1] > imax)
        for s_ in starts[sel]:
            out.add(b[s_ : s_ + n])
    return out


def build_sparse(docs, amin=3, amax=16):
    idx = defaultdict(set)
    for d, t in enumerate(docs):
        for g in sparse_grams(t, amin, amax):
            idx[g].add(d)
    return idx


# --------------------------------------------------------------------------
# 3-5. token unigram, token bigram, word-tuple, and the static vocab sidecar
# --------------------------------------------------------------------------
def build_token(docs):
    uni, bi = defaultdict(set), defaultdict(set)
    for d, t in enumerate(docs):
        ids = ENC.encode(t, disallowed_special=())
        for i in ids:
            uni[i].add(d)
        for a, b in zip(ids, ids[1:]):
            bi[(a, b)].add(d)
    return uni, bi


def vocab_strings():
    out = {}
    for i in range(ENC.n_vocab):
        try:
            s = ENC.decode_single_token_bytes(i).decode("utf-8")
        except Exception:
            continue
        if s:
            out[i] = s
    return out


def build_vocab_sidecar(toks, n=3):
    """char n-gram -> token ids whose string contains it. Static, ~2 MB."""
    idx = defaultdict(set)
    for i, s in toks.items():
        for j in range(len(s) - n + 1):
            idx[s[j : j + n]].add(i)
    return idx


def affix_maps(toks, maxk=8):
    sw, ew = defaultdict(set), defaultdict(set)
    for i, s in toks.items():
        for k in range(1, min(len(s), maxk) + 1):
            sw[s[:k]].add(i)
            ew[s[-k:]].add(i)
    return sw, ew


def postings(idx):
    return sum(len(v) for v in idx.values())


WORD_RE = __import__("re").compile(r"\w+")


def build_token_normalized(docs):
    """Token Search's normalisation, applied at INDEX time as well as query
    time: split on word runs, lowercase, encode each word alone with a fixed
    leading space. Without this the index and the query disagree whenever a
    word is not preceded by a space, which is most of code.
    """
    uni = defaultdict(set)
    for d, t in enumerate(docs):
        for m in WORD_RE.finditer(t):
            for i in ENC.encode(" " + m.group().lower()):
                uni[i].add(d)
    return uni

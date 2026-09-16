"""Shared loaders for the regex-filter / fuzzy experiments.

Everything keys off o200k_base, the tokenizer used in token-search.mdx.
"""
import glob
import re
from collections import defaultdict

import tiktoken

ENC = tiktoken.get_encoding("o200k_base")
DICT = "/usr/share/dict/american-english"


def vocab_strings():
    """token id -> its decoded string, for every utf-8-decodable token."""
    out = {}
    for i in range(ENC.n_vocab):
        try:
            s = ENC.decode_single_token_bytes(i).decode("utf-8")
        except Exception:
            continue
        if s:
            out[i] = s
    return out


def ngram_index(toks, n=3):
    """char n-gram -> set of token ids whose string contains it."""
    idx = defaultdict(set)
    for i, s in toks.items():
        for j in range(len(s) - n + 1):
            idx[s[j : j + n]].add(i)
    return idx


def affix_maps(toks, maxk=8):
    """prefix/suffix -> token ids, for straddle enumeration."""
    sw, ew = defaultdict(set), defaultdict(set)
    for i, s in toks.items():
        for k in range(1, min(len(s), maxk) + 1):
            sw[s[:k]].add(i)
            ew[s[-k:]].add(i)
    return sw, ew


def repo_corpus(chunk=2000, limit_py=200):
    """The blog repo itself, chunked into pseudo-documents."""
    docs = []
    for p in glob.glob("data/blog/*.mdx") + glob.glob("**/*.py", recursive=True)[:limit_py]:
        try:
            t = open(p, encoding="utf-8").read()
        except Exception:
            continue
        for i in range(0, len(t), chunk):
            docs.append(t[i : i + chunk])
    return docs


def english_words(minlen=5, maxlen=None):
    ws = {w.strip().lower() for w in open(DICT, encoding="utf-8", errors="ignore")}
    pat = re.compile(rf"[a-z]{{{minlen},{maxlen if maxlen else ''}}}")
    return sorted(w for w in ws if pat.fullmatch(w))


def trigrams(s, pad=True):
    s = f"${s}$" if pad else s
    return {s[i : i + 3] for i in range(len(s) - 2)}

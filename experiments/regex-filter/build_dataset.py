"""Build a regex-retrieval benchmark out of CodeSearchNet Python.

Documents  = functions from the test+validation splits.
Queries    = regex literals mined from re.* calls in the TRAIN split, so the
             patterns are real ones developers wrote and are disjoint from the
             documents they are searched against.
Ground truth = re.search(pattern, doc), computed exactly. No labels needed.

Run from the repo root:  python experiments/regex-filter/build_dataset.py
"""
import json
import os
import re
import sys
from collections import Counter

OUT = "experiments/regex-filter/data"
# re.compile("..."), re.search(r'...'), re.match(...), re.sub(...), re.findall(...)
CALL = re.compile(
    r"""re\.(?:compile|search|match|fullmatch|sub|subn|findall|finditer|split)\s*\(\s*"""
    r"""(?P<q>r?["'])(?P<pat>(?:\\.|(?!(?P=q))[^\\])*)(?P=q)""",
    re.S,
)


def mine(strings, cap=200_000):
    pats = Counter()
    for s in strings:
        for m in CALL.finditer(s):
            p = m.group("pat")
            if p:
                pats[p] += 1
        if len(pats) > cap:
            break
    return pats


def usable(p):
    """Keep patterns that compile, are not trivially tiny, and are not anchored
    in a way that can never match inside a document."""
    if len(p) < 3 or len(p) > 200:
        return False
    try:
        re.compile(p)
    except re.error:
        return False
    # \1-style backrefs and inline flags interact badly with the plan compiler
    if re.search(r"\\[0-9]|\(\?[aiLmsux]*\)", p):
        return False
    return True


def main():
    from datasets import load_dataset

    os.makedirs(OUT, exist_ok=True)
    print("loading CodeSearchNet python...", flush=True)
    tr = load_dataset("code-search-net/code_search_net", name="python",
                      split="train", trust_remote_code=True)
    print(f"  train {len(tr):,}", flush=True)

    print("mining regex literals from train split...", flush=True)
    pats = mine(tr["whole_func_string"])
    print(f"  {len(pats):,} distinct literals, {sum(pats.values()):,} occurrences", flush=True)

    keep = {p: c for p, c in pats.items() if usable(p)}
    print(f"  {len(keep):,} usable after filtering", flush=True)

    with open(f"{OUT}/patterns.json", "w") as f:
        json.dump(sorted(keep.items(), key=lambda kv: -kv[1]), f)

    print("\ntop 25 mined patterns by frequency:", flush=True)
    for p, c in sorted(keep.items(), key=lambda kv: -kv[1])[:25]:
        print(f"  {c:>5}x  {p!r}", flush=True)

    for split in ("test", "validation"):
        d = load_dataset("code-search-net/code_search_net", name="python",
                         split=split, trust_remote_code=True)
        docs = [s for s in d["whole_func_string"] if s]
        with open(f"{OUT}/docs_{split}.json", "w") as f:
            json.dump(docs, f)
        nb = sum(len(s) for s in docs)
        print(f"\ncorpus {split}: {len(docs):,} docs, {nb/1e6:.1f} MB, "
              f"mean {nb/len(docs):.0f} chars", flush=True)


if __name__ == "__main__":
    sys.exit(main())

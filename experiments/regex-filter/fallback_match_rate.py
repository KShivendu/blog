"""How many documents do the unfilterable patterns match anyway?

A pattern with no usable literal forces a full scan. That only costs speed if
the pattern matches few documents: if it matches nearly all of them, even a
perfect filter would hand back nearly the whole corpus. This measures the
match rate of the most frequent no-literal patterns in the re.compile set.

Run from the repo root:
  python3 experiments/regex-filter/fallback_match_rate.py
"""
import json
import os
import random
import re
import signal
import sys

sys.path.insert(0, os.path.dirname(__file__))
from literals import required  # noqa: E402

DOCS = os.path.expanduser("~/projects/research/token-regex/token-regex-rs/.cache/docs_big.json")
N_DOCS = 5000
TOP = 40


class Slow(Exception):
    pass


def main():
    raw = json.load(open(DOCS))
    docs = raw if isinstance(raw[0], str) else [d["text"] for d in raw]
    random.Random(0).shuffle(docs)
    docs = docs[:N_DOCS]
    pats = json.load(open("experiments/regex-filter/data/patterns.json"))
    fb = [(p, c) for p, c in pats if not required(p)][:TOP]
    print(f"{len(docs)} docs, top {len(fb)} no-literal patterns by frequency", flush=True)
    rates = []
    signal.signal(signal.SIGALRM, lambda *a: (_ for _ in ()).throw(Slow()))
    for p, c in fb:
        try:
            rx = re.compile(p)
        except re.error:
            continue
        signal.alarm(20)
        try:
            hit = sum(1 for d in docs if rx.search(d))
        except Slow:
            print(f"  (timeout) {p}", flush=True)
            continue
        finally:
            signal.alarm(0)
        r = hit / len(docs)
        rates.append((r, p, c))
        print(f"  {r:6.1%}  x{c:<3d} {p}", flush=True)
    rs = sorted(r for r, _, _ in rates)
    q = lambda f: rs[int(f * (len(rs) - 1))]
    print(f"\nmatch rate over {len(rs)} patterns: p25 {q(.25):.1%}  p50 {q(.5):.1%}  p75 {q(.75):.1%}")
    print(f"patterns matching >=50% of docs: {sum(r >= .5 for r in rs)}/{len(rs)}")
    print(f"patterns matching <5% of docs:   {sum(r < .05 for r in rs)}/{len(rs)}")
    for r, p, c in sorted(rates)[:6]:
        print(f"  rare: {r:6.1%}  {p}")


if __name__ == "__main__":
    main()

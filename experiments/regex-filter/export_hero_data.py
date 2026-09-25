"""Dump the hero component's corpus so the widget reads real documents.

The hero used a hand-pasted bit array, which drifts from the code the moment
anything changes. This writes the actual document text instead, so the browser
can compute chunk containment live for whatever the reader types and the widget
cannot disagree with the benchmark.

Run from the repo root:
  python3 experiments/regex-filter/export_hero_data.py
"""
import json
import os
import random
import re
import sys

DATA = "experiments/regex-filter/data"
OUT = "public/static/data/regex-filter-hero.json"
N_DOCS = 24
MAX_CHARS = 700
SEED_QUERY = r"get_user\w*"


def label_of(text):
    """The def/class line, which is what a reader recognises a function by."""
    for line in text.splitlines():
        s = line.strip()
        if s.startswith(("def ", "class ", "async def ")):
            return (s[:52] + "...") if len(s) > 55 else s
    return (text.strip().splitlines() or ["(snippet)"])[0][:52]


def main():
    docs = json.load(open(f"{DATA}/docs_test.json"))
    rx = re.compile(SEED_QUERY)
    rng = random.Random(3)

    hits = [d for d in docs if rx.search(d)][:4]
    near = [d for d in docs if "user" in d and not rx.search(d)][:8]
    rest = [d for d in docs if "user" not in d]
    rng.shuffle(rest)
    sel = hits + near + rest[: N_DOCS - len(hits) - len(near)]
    rng2 = random.Random(11)
    rng2.shuffle(sel)

    out = {
        "generated_by": "experiments/regex-filter/export_hero_data.py",
        "source": "CodeSearchNet Python, test split",
        "seed_query": SEED_QUERY,
        "docs": [{"label": label_of(t), "text": t[:MAX_CHARS]} for t in sel],
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"))
    kb = os.path.getsize(OUT) / 1024
    print(f"wrote {OUT}  {len(out['docs'])} docs, {kb:.0f} KB", flush=True)

    # sanity: the seeded query must still have matches after truncation
    n = sum(1 for d in out["docs"] if rx.search(d["text"]))
    print(f"  documents matching /{SEED_QUERY}/ after truncation: {n}", flush=True)
    lit = "get_user"
    tri = [lit[i : i + 3] for i in range(len(lit) - 2)]
    for g in tri:
        c = sum(1 for d in out["docs"] if g in d["text"])
        print(f"    chunk {g!r:6} in {c:2} docs", flush=True)
    both = sum(1 for d in out["docs"] if all(g in d["text"] for g in tri))
    print(f"    all {len(tri)} chunks present in {both} docs", flush=True)


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""Dump the top retrieved docs, before and after the stemmer, for a few queries.

relevance-tail.mdx tells the reader to go look at the actual queries, and the
QueryExplorer component lets them open one. This generates what it opens: for
each hand-picked query, the top documents the `word` and `word_en` analyzers
return, with the judged-relevant ones marked.

The queries are chosen to be readable by someone who doesn't work on search,
since the component's job is to make the failure obvious rather than complete.

Run:
  cd <experiments repo>
  uv run --with ranx --with numpy --with nltk --with datasets \
     python <this file> --out <blog>/public/static/data/relevance-tail-docs.json
"""
import argparse
import json
import pathlib
import sys

EXPERIMENTS = pathlib.Path.home() / "projects/axiom-labs/wholembed/experiments"
sys.path.insert(0, str(EXPERIMENTS))

from token_search.analyzers import word_analyze, word_analyze_en  # noqa: E402
from token_search.bm25 import BM25  # noqa: E402
from token_search.loader import load_nano  # noqa: E402

# (dataset, exact query text, one-line note on what the analyzers do to it)
PICKS = [
    (
        "NanoMSMARCO",
        "who sang here i go again",
        "the stoplist deletes here, i and again, so only sang and go reach the index",
    ),
    (
        "NanoNQ",
        "who appoints the members of the given branch in the united states",
        "the stemmer cuts united states down to unit state",
    ),
    (
        "NanoMSMARCO",
        "who invented corn flakes",
        "the stemmer folds invented, invents and invention onto one term, which helps here",
    ),
]

ANALYZERS = {"word": word_analyze, "word_en": word_analyze_en}
TOP_N = 5


def top_docs(corpus, qrels, qid, query, analyze, n=TOP_N):
    items = list(corpus.items())
    doc_ids = [d for d, _ in items]
    bm = BM25([analyze(t) for _, t in items], idf_mode="lucene", k1=1.5, b=0.75)
    scored = sorted(bm.score(analyze(query)).items(), key=lambda kv: kv[1], reverse=True)[:n]
    rel = qrels.get(qid, {})
    out = []
    for i, sc in scored:
        is_rel = bool(rel.get(doc_ids[i], 0))
        doc = {"id": doc_ids[i], "score": round(sc, 2), "relevant": is_rel}
        # the component prints a rank and a placeholder for everything else, so only
        # the judged-relevant document's text is worth shipping to the browser
        if is_rel:
            doc["text"] = corpus[doc_ids[i]].strip().replace("\n", " ")[:240]
        out.append(doc)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--scores", help="relevance-tail.json, to copy NDCG@10 from")
    args = ap.parse_args()

    scores = json.loads(pathlib.Path(args.scores).read_text())["rows"] if args.scores else None

    by_ds = {}
    for ds, *_ in PICKS:
        by_ds.setdefault(ds, None)
    for ds in by_ds:
        print(f"loading {ds}…", flush=True)
        by_ds[ds] = load_nano(ds)

    out = []
    for ds, query, note in PICKS:
        corpus, queries, qrels = by_ds[ds]
        qid = next((q for q, t in queries.items() if t.strip() == query), None)
        if qid is None:
            print(f"  !! not found in {ds}: {query}", flush=True)
            continue
        row = {"ds": ds.replace("Nano", ""), "qid": qid, "q": query, "note": note, "runs": {}}
        for name, fn in ANALYZERS.items():
            row["runs"][name] = {
                "terms": fn(query),
                "docs": top_docs(corpus, qrels, qid, query, fn),
            }
        n_rel = sum(1 for v in qrels.get(qid, {}).values() if v)
        row["relevantTotal"] = n_rel
        # the component prints the NDCG@10 either side, and it has to agree with the
        # per-query file the charts use, so read it from there rather than recompute
        if scores is not None:
            m = next(
                (r for r in scores if r["q"].strip() == query and r["ds"] == row["ds"]), None
            )
            if m:
                row["ndcg10"] = round(m["ndcg10"] * 100, 1)
                row["ndcg10_en"] = round(m["ndcg10_en"] * 100, 1)
        out.append(row)
        print(f"  {query[:50]}  ({n_rel} relevant docs judged)", flush=True)

    pathlib.Path(args.out).write_text(json.dumps({"queries": out}, indent=1))
    print(f"\nwrote {len(out)} queries to {args.out}", flush=True)


if __name__ == "__main__":
    main()

"""Dump the real pieces each tokenizer produces for the RegexChopper hero line.

The component compares how four methods chop one line of Python. Hand-typing
those pieces drifts the moment a tokenizer changes, so they come from the
tokenizers themselves.

Run from the repo root:
  python3 experiments/regex-filter/export_chopper_data.py
"""
import json
import os
import sys

sys.path.insert(0, "experiments/regex-filter")
sys.path.insert(0, "/home/kshivendu/projects/research/tokenizer/isbpe/src")

OUT = "public/static/data/regex-filter-chopper.json"
LINE = "def get_user_config(name):"
QUERY = "get_user"


def main():
    import tiktoken
    from indexes import sparse_grams

    enc = tiktoken.get_encoding("o200k_base")
    out = {
        "generated_by": "experiments/regex-filter/export_chopper_data.py",
        "line": LINE,
        "query": QUERY,
        "methods": {},
    }

    tri = [LINE[i : i + 3] for i in range(len(LINE) - 2)]
    out["methods"]["trigram"] = {"pieces": tri, "total": len(tri)}

    sg = sparse_grams(LINE)
    longer = sorted((g.decode("utf-8", "replace") for g in sg if len(g) > 3), key=len)
    out["methods"]["sparse"] = {"pieces": tri, "extra": longer[:8], "total": len(sg)}

    bpe = [enc.decode([i]) for i in enc.encode(LINE)]
    out["methods"]["bpe"] = {
        "pieces": bpe,
        "total": len(bpe),
        "query_pieces": [enc.decode([i]) for i in enc.encode(QUERY)],
        "in_line_pieces": [enc.decode([i]) for i in enc.encode(" " + QUERY)],
    }

    try:
        from isbpe import ISBPE

        docs = json.load(open("experiments/regex-filter/data/docs_test.json"))[:6000]
        tok = ISBPE(mode="dual").train("\n".join(docs).encode(), vocab_size=32768)
        disp = [tok[i].display() for i in tok.encode(LINE)]
        out["methods"]["isbpe"] = {
            "pieces": disp,
            "total": len(disp),
            "query_pieces": [tok[i].display() for i in tok.encode(QUERY)],
            # the identity claim: same word, three different neighbours
            "identity": {
                ctx: [tok[i].display() for i in tok.encode(ctx.format(QUERY))]
                for ctx in ("def {}(", "self.{}(", "_{}(")
            },
        }
        print("  isbpe trained and exported", flush=True)
    except Exception as e:
        print(f"  SKIP isbpe: {str(e)[:90]}", flush=True)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"))
    print(f"wrote {OUT}  {os.path.getsize(OUT)/1024:.1f} KB", flush=True)
    for k, v in out["methods"].items():
        print(f"  {k:8} {v['total']:3} pieces  {v['pieces'][:6]}", flush=True)
    if "isbpe" in out["methods"]:
        for c, p in out["methods"]["isbpe"]["identity"].items():
            print(f"    {c.format(QUERY):20} -> {p}", flush=True)


if __name__ == "__main__":
    sys.exit(main())

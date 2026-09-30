"""Mine regex SEARCH queries written by coding agents.

The patterns in build_dataset.py come from re.compile calls in source code, so
they are string-processing utilities rather than searches. Nobody greps a repo
for `\\s+`. Agents searching a codebase should look different, and this pulls
their actual searches out of published trajectories.

Sources: OpenHands and SWE-agent trajectories, where a search is either a bash
`grep` or SWE-agent's own `search_dir` / `search_file` command.

Run from the repo root:  python experiments/regex-filter/mine_agent_queries.py
"""
import json
import os
import re
import sys
from collections import Counter

OUT = "experiments/regex-filter/data"
LIMIT = int(os.environ.get("LIMIT", 3000))

# grep/rg/ag invocation -> the pattern argument
GREP = re.compile(
    r"""\b(?:grep|egrep|rg|ag|ack)\b(?P<flags>(?:\s+-{1,2}[\w-]+(?:=\S+)?)*)\s+"""
    r"""(?P<q>['"])(?P<pat>(?:\\.|(?!(?P=q))[^\\])+)(?P=q)""")
GREP_BARE = re.compile(
    r"""\b(?:grep|egrep|rg|ag|ack)\b(?:\s+-{1,2}[\w-]+(?:=\S+)?)*\s+(?P<pat>[^\s'"|;&>]{3,})\s""")
# SWE-agent's own search commands
SWEA = re.compile(r"""\b(?:search_dir|search_file|find_file)\s+(?P<q>['"])(?P<pat>[^'"]+)(?P=q)""")


def texts(row):
    """Yield every string an agent emitted in this trajectory."""
    for turn in row.get("trajectory") or []:
        if not isinstance(turn, dict):
            continue
        c = turn.get("content")
        if isinstance(c, str):
            yield c
        elif isinstance(c, list):
            for part in c:
                if isinstance(part, dict) and isinstance(part.get("text"), str):
                    yield part["text"]
        for tc in turn.get("tool_calls") or []:
            try:
                yield json.dumps(tc)
            except Exception:
                pass
        if isinstance(turn.get("action"), str):
            yield turn["action"]


def main():
    from datasets import load_dataset
    os.makedirs(OUT, exist_ok=True)
    pats, kinds = Counter(), Counter()
    for name in ["nebius/SWE-rebench-openhands-trajectories",
                 "nebius/SWE-agent-trajectories"]:
        n = 0
        try:
            ds = load_dataset(name, split="train", streaming=True)
        except Exception as e:
            print(f"SKIP {name}: {str(e)[:80]}", flush=True)
            continue
        for row in ds:
            n += 1
            for t in texts(row):
                for m in GREP.finditer(t):
                    pats[m.group("pat")] += 1; kinds["grep"] += 1
                for m in SWEA.finditer(t):
                    pats[m.group("pat")] += 1; kinds["search_dir"] += 1
            if n % 250 == 0:
                print(f"  {name}  {n} trajectories, {len(pats):,} distinct patterns",
                      flush=True)
            if n >= LIMIT:
                break
        print(f"{name}: {n} trajectories -> {len(pats):,} distinct\n", flush=True)

    keep = {}
    for p, c in pats.items():
        if not (2 <= len(p) <= 200):
            continue
        try:
            re.compile(p)
        except re.error:
            continue
        keep[p] = c
    print(f"{len(keep):,} usable agent-written search patterns  {dict(kinds)}\n", flush=True)
    json.dump(sorted(keep.items(), key=lambda kv: -kv[1]), open(f"{OUT}/agent_patterns.json", "w"))

    print("top 30 by frequency:", flush=True)
    for p, c in sorted(keep.items(), key=lambda kv: -kv[1])[:30]:
        print(f"  {c:>4}x  {p!r}", flush=True)


if __name__ == "__main__":
    sys.exit(main())

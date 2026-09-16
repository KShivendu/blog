"""Extract the required literal runs from a regex.

Conservative by construction: a document matching the regex must contain every
literal this returns, so dropping a literal is always safe and inventing one is
never safe. Alternation yields an OR group, everything else ANDs.

Returns a list of OR-groups: [[lit, ...], [lit, ...]] meaning
  (lit or lit or ...) AND (lit or lit or ...)
"""
import re

META = set(".^$*+?{}[]\\|()")
# escapes that stand for a literal character
ESC_LIT = {"\\.": ".", "\\\\": "\\", "\\/": "/", "\\-": "-", "\\+": "+", "\\*": "*",
           "\\?": "?", "\\(": "(", "\\)": ")", "\\[": "[", "\\]": "]", "\\{": "{",
           "\\}": "}", "\\|": "|", "\\^": "^", "\\$": "$", "\\n": "\n", "\\t": "\t"}


def _split_top(pat):
    """Split on top-level | into alternation branches."""
    out, depth, cur, i, incls = [], 0, [], 0, False
    while i < len(pat):
        c = pat[i]
        if c == "\\" and i + 1 < len(pat):
            cur.append(pat[i : i + 2]); i += 2; continue
        if incls:
            cur.append(c)
            if c == "]": incls = False
            i += 1; continue
        if c == "[": incls = True; cur.append(c); i += 1; continue
        if c == "(": depth += 1
        elif c == ")": depth -= 1
        elif c == "|" and depth == 0:
            out.append("".join(cur)); cur = []; i += 1; continue
        cur.append(c); i += 1
    out.append("".join(cur))
    return out


def _runs(pat):
    """Literal runs in a regex with no top-level alternation.

    A char followed by ? or * is optional, so it cannot be required and it also
    breaks the run. A group is opaque: it breaks the run.
    """
    runs, cur, i = [], [], 0
    while i < len(pat):
        c = pat[i]
        nxt2 = pat[i : i + 2]
        if c == "\\" and nxt2 in ESC_LIT:
            ch, adv = ESC_LIT[nxt2], 2
        elif c == "\\":
            runs.append("".join(cur)); cur = []; i += 2; continue
        elif c in META:
            if c == "[":
                j, d = i + 1, 0
                while j < len(pat) and (pat[j] != "]" or d):
                    if pat[j] == "\\": j += 1
                    j += 1
                i = j + 1
            elif c == "{":
                k = pat.find("}", i)
                runs.append("".join(cur)); cur = []
                i = (k + 1) if k > 0 else (i + 1)
                continue
            elif c == "(":
                # Find the matching ")". A group is only safe to recurse into
                # when it is a plain or non-capturing group with no inner
                # alternation and no quantifier. Lookarounds are never safe:
                # a negative lookbehind's body is FORBIDDEN, not required.
                j, d = i, 0
                while j < len(pat):
                    if pat[j] == "\\": j += 2; continue
                    if pat[j] == "[":
                        while j < len(pat) and pat[j] != "]":
                            j += 2 if pat[j] == "\\" else 1
                    elif pat[j] == "(": d += 1
                    elif pat[j] == ")":
                        d -= 1
                        if d == 0: break
                    j += 1
                body = pat[i + 1 : j]
                after = pat[j + 1 : j + 2]
                runs.append("".join(cur)); cur = []
                if body.startswith("?"):
                    if body.startswith("?:"):
                        body = body[2:]
                    elif body.startswith("?P<") and ">" in body:
                        body = body[body.index(">") + 1 :]
                    else:
                        body = None          # lookaround or flag group
                if body is not None and after not in "?*{" and len(_split_top(body)) == 1:
                    runs.extend(_runs(body))
                i = j + 1
                continue
            else:
                i += 1
            runs.append("".join(cur)); cur = []
            continue
        else:
            ch, adv = c, 1
        # quantifier right after this char makes it optional or repeated
        q = pat[i + adv : i + adv + 1]
        if q and q in "?*":  # note: "" in "?*" is True, so the guard is load-bearing
            runs.append("".join(cur)); cur = []; i += adv + 1; continue
        if q == "{":
            k = pat.find("}", i + adv)
            if k < 0:  # unbalanced brace, treat as a literal char
                cur.append(ch); i += adv; continue
            lo = pat[i + adv + 1 : k].split(",")[0]
            cur.append(ch)
            if not (lo.isdigit() and int(lo) >= 1):
                runs.append("".join(cur[:-1])); cur = []
            runs.append("".join(cur)); cur = []
            i = k + 1; continue
        if q == "+":
            cur.append(ch); runs.append("".join(cur)); cur = []; i += adv + 1; continue
        cur.append(ch); i += adv
    runs.append("".join(cur))
    return [r for r in runs if r]


def required(pat, minlen=3):
    """AND of OR-groups. Empty list means no usable constraint."""
    branches = _split_top(pat)
    if len(branches) > 1:
        # every branch must contribute, else the OR is unconstrained
        groups = []
        for b in branches:
            rs = [r for r in _runs(b) if len(r) >= minlen]
            if not rs:
                return []
            groups.append(max(rs, key=len))
        return [sorted(set(groups))]
    return [[r] for r in _runs(pat) if len(r) >= minlen]


if __name__ == "__main__":
    import json, sys
    from collections import Counter
    pats = [p for p, _ in json.load(open("experiments/regex-filter/data/patterns.json"))]
    print(f"{len(pats):,} mined patterns\n", flush=True)
    for minlen in (3, 4, 5, 6):
        n = sum(1 for p in pats if required(p, minlen))
        print(f"  min literal len {minlen}: {n:5,} usable ({100*n/len(pats):5.1f}%), "
              f"{len(pats)-n:5,} must full-scan ({100*(len(pats)-n)/len(pats):.1f}%)", flush=True)
    print("\n  examples WITH a usable literal (minlen=4):", flush=True)
    shown = 0
    for p in pats:
        r = required(p, 4)
        if r and shown < 12:
            print(f"    {p!r:48} -> {r}", flush=True); shown += 1
    print("\n  examples with NONE (minlen=4):", flush=True)
    shown = 0
    for p in pats:
        if not required(p, 4) and shown < 12:
            print(f"    {p!r}", flush=True); shown += 1

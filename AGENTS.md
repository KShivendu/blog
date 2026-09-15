# Project guidelines

## Rules

- Present math as ASCII in code blocks, not LaTeX — the Claude Code terminal doesn't render LaTeX. (LaTeX is fine inside `.mdx` blog posts, which render via KaTeX.)

## Writing for the blog (IMPORTANT)

Full guide: `writing-style.md`. Read it before drafting or editing any `.mdx`. The rules
below are the ones that get broken most, so treat them as the minimum bar.

**Never frame a thing against what it isn't.** No "it's not X, it's Y", no "not a X, not a
Y, a Z", and no negation clipped onto the end of a sentence ("real, not rounding", "a
trade, not an upgrade", "no guessing"). Say what it is and stop. A contrast is only
allowed when both sides are real, named things the post is actually comparing
("percentiles of Δ, not the Δ of percentiles").

**No em dashes or en dashes, anywhere.** Use a period, comma, colon, or parentheses, or
rewrite the sentence. Scan for `—` and `–` before finishing.

**Chart, then `Observations:`, then bullets. Every time.** Never a paragraph after a
chart. One claim per bullet, with its number, and the reason in the same sentence.

**Cut the wrap-up.** A sentence at the end of a section that restates what the section
just proved is dead weight. So is a second clause that re-explains the first.

**Bold labels take a period, never a colon.** `**Label.** text` is the house form and is
fine anywhere, including Key Takeaways. `**Label:** text` is the scaffold to avoid. The
label has to read like natural English a person would say out loud.

**Banned:** "closes the loop", and hedges the user doesn't use: "genuinely", "clearly",
"worth noting", "a real but modest". Don't soften a direct ask into "I'd like to see".

**Less is more.** After any cut, re-read the shortened sentence alone and check it is
still exactly true. If the cut changed a number, a scope, or a causal claim, put the
precise version back even if it costs words. When one correctness error is flagged, audit
the rest of the same pass for the same class of mistake.

**Glossary tooltips are `#[phrase](explanation)`.** The remark plugin scans plain text
nodes only, so the explanation cannot contain backticks (they become `inlineCode` nodes
and split the pattern) or parentheses (the regex stops at the first one). Write the
explanation in plain prose, and check it rendered rather than assuming.

**Finish every example you start.** Never name a transformation or comparison and leave
the values out.

## Chart colour

`lib/viz-palette.js` is the only place a chart colour is defined. A chart names a
ROLE and gets the step validated for the surface it's drawn on, so it follows the
theme. Never write a hex into an `.mdx` or a component.

- `role: 'statP50'` colours a whole series; `roles: [...]` colours one bar each.
- Three kinds of role, and they don't mix. ORDERED (`statP10/P25/P50`) is one hue
  stepped by lightness, only for values that have an order. IDENTITY (`series[0..3]`)
  is fixed slots, never cycled, because the order is the colourblind-safety
  mechanism. POLARITY (`bad` / `neutral` / `good`) is reserved; don't spend it on
  identity.
- `statMean` and `statMuted` are grey on purpose. The mean and any pinned statistic
  are furniture, not a fourth colour.
- Check any new colour with `python3 scripts/color-check.py`. Floors: OKLab dE >= 15
  between things a reader must tell apart, contrast >= 3:1 against the surface.

## Investigating experiments (IMPORTANT)

Every experiment tests a specific hypothesis I hold. When a result surprises you or doesn't behave as expected, **form a hypothesis and find the actual cause by looking into the data** — the specific rows, queries, terms, documents, per-dataset deltas. Read them.

- Never paper over a surprise with a verbal verdict: "it's a wash", "no difference", "it doesn't compound", "everything saturates", "the honest answer is...". These are guesses dressed as conclusions. They annoy me. Cut them.
- Always report the full distribution — mean, p50, p25, zero-rate — never the mean alone.
- Break down win / loss / tie per dataset, not just the aggregate. A flat mean hides where the hypothesis held or broke. "Tied on the mean but won 7/12 on the tail" is a finding; "it's a wash" erases it. When something loses, say which datasets dropped, by how much, and _why_ from the actual rows.
- Hold the original hypothesis fixed. Don't restate the conclusion in new words, don't drift onto adjacent experiments, don't oscillate between framings without new data. One hypothesis → one data-backed verdict → move deliberately.
- The bar: every verdict is a claim I can point to specific rows to defend.

## Long-running research tasks (the nudge)

When a session is a long-running research or evaluation investigation (not a one-off edit), **start every turn by re-anchoring on the goal** so I don't have to re-explain it each time. Before doing any work, emit a short `where we are` block:

- **Goal** — the hypothesis or question this investigation is testing (one line).
- **Established** — what prior turns already proved/disproved, each backed by the specific data rows (bullets).
- **This turn** — the single next step you're about to take and why it moves the hypothesis.
- **Open risks** — the one or two ways this step could mislead, and how you'll catch it.

Keep it to ~5 lines, then proceed. A bare `continue` or a small steer should be enough for me to pick a turn back up. If a result surprises you, stop and form a hypothesis from the actual rows before continuing — never paper over it (see _Investigating experiments_ above).

## Tooling policy

- **MCP servers:** Do not hand-edit `~/.pi/agent/mcp.json` to keep an MCP server always loaded — its tool schemas burn context every session. `pi-mcp-adapter` (`pi install npm:pi-mcp-adapter`) is installed **only when a specific MCP server is genuinely needed**; add just that server, use it, then remove it when the task is done. Default state: no MCP server configured.
- **No extra extensions by default.** Don't install third-party pi extensions speculatively.
- **When you hit a real limitation, write the extension yourself in TypeScript** (project-local, under a path like `scripts/ext/`) rather than pulling a third-party package. Prefer a ~40-line custom extension over a dependency.

## Parallel research threads (git worktrees)

One worktree per active research thread, so investigations can run in parallel without stepping on each other. All research worktrees branch off `main` (or a `--base <branch>`) under `research/<slug>` and live in a sibling directory `<repo>-wt/`.

Use the helper:

```
scripts/wt new <slug> [--base <branch>]   # create research/<slug> worktree; prints its path
scripts/wt ls                             # list research worktrees
scripts/wt go <slug>                      # print path; cd into it with: cd "$(scripts/wt go <slug>)"
scripts/wt rm <slug>                      # remove worktree + delete its branch
scripts/wt root                           # print the worktree root
```

Convention: `slug` = kebab-case short name for the hypothesis being tested. Each thread is self-contained — its own branch, its own working tree, its own session (`pi` started from that worktree path). Merge or discard with `scripts/wt rm <slug>` once the hypothesis is resolved.

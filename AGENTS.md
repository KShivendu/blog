# Project guidelines

## Rules

- Present math as ASCII in code blocks, not LaTeX — the Claude Code terminal doesn't render LaTeX. (LaTeX is fine inside `.mdx` blog posts, which render via KaTeX.)

## Writing for the blog (IMPORTANT)

Use the `natural-writing` skill for any prose in this repo: posts, READMEs, Key Takeaways,
observations under charts, and edits to existing text. Read it before drafting or editing,
and run its checker on the result before committing.

## Charts

Full guide: `chart-style.md`. Read it before touching a chart. The minimum bar:

**A chart never picks a colour.** It names a role and `lib/viz-palette.js` returns the
value validated for the surface it's drawn on. `role: 'statP50'` colours a series,
`roles: [...]` colours one bar each. Never write a hex into an `.mdx`: a static hex
can't follow the theme.

**Three kinds of role, and they don't mix.** ORDERED (`statP10/P25/P50`) is one hue
stepped by lightness, only for values that have an order. IDENTITY (`series[0..3]`,
`seriesAlt[0..3]`) is fixed slots assigned in order, never cycled, because the order is
what keeps them apart under deutan and protan vision. POLARITY (`bad`/`neutral`/`good`)
is reserved; a chart that paints its third series red has told the reader something
false.

**Five or more series means families, not more hues.** Six categorical colours can't all
clear the separation floor. Six lines are usually three families of two, which is three
hues with `seriesAlt` as the second step inside each.

**The mean is grey**, and so is any statistic pinned where it can't move. Markers all
carry the same weight; nothing outranks the bars.

**Measure, don't eyeball.** `python3 scripts/color-check.py sep|contrast|oklch`. Floors
are dE 15 between things a reader must tell apart and 3:1 against the surface. A value
may fall short when the mark carries its own text label, and the file has to say so.

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

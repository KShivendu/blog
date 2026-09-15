# Chart style

How charts on this blog are coloured and built. `writing-style.md` covers the prose
around a chart. This covers the chart.

The short version: a chart never picks a colour. It names a role, and
`lib/viz-palette.js` hands back the value validated for the surface it's drawn on.

## Why there are rules at all

Before this, every chart picked its own hex. The audit found:

- **344 hex literals across 21 posts.** `token-storage-extra.mdx` alone had 198.
- **Four separate copies of the same neutral chrome.** BarChart and LineChart held
  byte-identical `palette()` functions, and eight more components
  (`CoordinatedOmission`, `SpladeVsIF`, `SimilarityGate`, `TokenCompressionPipeline`,
  `TokenSearchAnalyzer`, `StemExpandHero`, `LoadModelAnimated`,
  `TokenCompressionAnimated`) each inlined their own.
- **Colours a reader cannot separate.** LineChart's default list put cyan `#0891b2`
  next to teal `#0d9488`, 6.9 dE apart. PostingCurves had four pairs under the floor,
  the worst at 9.8.
- **One colour meaning two things in one post.** In `token-search.mdx`, `#38bdf8` was
  "char trigram" in one chart and "r50k" in the next; `#10b981` was "normalized" and
  "o200k".
- **Light-mode values on the dark card.** LineChart swapped only its first colour in
  dark mode, so the other five ran at contrast as low as 3.43.

The same mean was slate in one post and amber in another. That is what made the
charts look like random colour rather than a system.

## The two floors

Check anything new with `python3 scripts/color-check.py`:

```
python3 scripts/color-check.py sep "#00b066" "#007844"      # perceptual distance
python3 scripts/color-check.py contrast "#00b066" "#ffffff" # legibility
python3 scripts/color-check.py oklch "#00b066"              # L, C, H
```

**Separation: OKLab dE >= 15** between any two things a reader must tell apart. dE is
OKLab distance times 100. Below 15 a normal-vision reader starts guessing; below 8
they cannot do it at all.

**Contrast: >= 3:1** against the surface the mark sits on. White `#ffffff` in light,
the card `#0d1310` in dark.

A value may fall short of one floor when the mark carries its own text label, and the
file has to say so. Two currently do, both deliberate:

- Light p50 `#00b066` sits at 2.76:1. Three steps of one hue on white cannot be both
  15 apart and 3:1 at once, so the ramp takes separation.
- The mean sits 14.2 dE from p25. A grey that matches the site's green tint gives up
  about a point, because moving away from the ramp's hue is what buys the distance.

## Three kinds of role, and they don't mix

This is the rule that matters most. Picking the wrong kind is what makes a chart look
arbitrary, whatever the individual colours are.

**Ordered** is for values that have an order: `statP10`, `statP25`, `statP50`. One
green hue, stepped by lightness. On white it darkens as the percentile drops; on the
dark card it brightens. Either way, more ink means further down the tail. Never give
an ordered family separate hues, and never use it for things that merely happen to
sit next to each other.

**Identity** is for different things being compared: `series[0..3]`, plus
`seriesAlt[0..3]` for the second member of a family. Fixed slots, assigned in order,
never cycled. The order is the colourblind-safety mechanism, not decoration:
green, blue, amber, magenta was picked by enumerating all 24 orderings and taking
the best worst-adjacent separation under simulated deutan and protan vision.

**Polarity** is reserved: `bad`, `neutral`, `good`. Red means a failure, green means
a success, sage means a bar with no story. Never spend these on identity. A chart
that paints its third series red has told the reader something false.

## Five or more series

Don't reach for a fifth hue. Six categorical colours cannot all clear dE 15, so the
honest move is to notice that the series are usually families.

PostingCurves has six lines, which looks like it needs six colours. It is really
three families of two: word and word+stem, naive and normalized, char bigram and
char trigram. That is three identity hues with `seriesAlt` as the second step inside
each, and every pair clears dE 15 within itself.

If the series genuinely don't group, fold the extras into an "other" band or split
the chart into facets.

## The mean is grey

`statMean` and `statMuted` are `#78807b` light, `#777e78` dark. Any statistic that is
pinned and therefore says nothing gets the same treatment, which is why p75 and p90
are grey in the delta chart: both sit at 100 and cannot move.

The grey is tinted green (hue 159 and 150) to sit in the same family as the site's
own neutrals, `gray-400 #8A968E` and `gray-300 #C8CFC9`. A pure neutral separates
about one dE better, because moving away from the ramp's hue is what buys the
distance, but it reads as a foreign colour next to the greens. That was tried and
looked wrong.

Markers all carry the same stroke weight. Nothing on a chart should outrank the bars.
A marker is dashed by default; `solid` drops the dash for one that shouldn't read as
an estimate. There is no "make this one bold" flag, on purpose.

## Green is the site's green

Chart green is `#047857`, which is `primary.500` in `tailwind.config.js`, the same
colour as the links and the logo. A chart's first series matches the page around it.

## Writing a chart

```jsx
series={[
  { name: 'mean',   values: [...], role: 'statMean' },
  { name: 'p50',    values: [...], role: 'statP50'  },
]}
```

- `role` colours a whole series. `roles: [...]` colours one bar each, for a chart
  whose bars are different statistics rather than one series.
- `color` and `colors` take a literal and skip the palette. They exist for the case
  the roles genuinely don't cover. Reach for a role first.
- Never write a hex into an `.mdx`. A static hex cannot follow the theme, which is
  the concrete reason this rule exists rather than a stylistic one.

## Chrome

`chartChrome(dark)` has the furniture every chart draws before any data: `ink`,
`muted`, `grid`, `axis`, `tip`, `border`, `card`, `accent`, `accentInk`. Values come
from the `gray` scale in `tailwind.config.js`. Import it rather than inlining the
neutrals again.

## Seeing it

`/charts` renders every chart type and every palette role on one page, both
themes. Swatches print their contrast against the current surface and turn red
under 3:1, so the deliberate exceptions stay visible rather than becoming folklore.
Check a palette change there before hunting through posts.

## What is still to migrate

Done: the two shared charts, the `token-search` post and its four components.
That post now has zero hex literals and one meaning per colour.

Left:

1. **Eight animation components** (`CoordinatedOmission`, `SpladeVsIF`,
   `SimilarityGate`, `TokenCompressionPipeline`, `TokenSearchAnalyzer`,
   `StemExpandHero`, `LoadModelAnimated`, `TokenCompressionAnimated`) inline their
   own copy of the chrome neutrals. Mechanical swap to `chartChrome`.
2. **The remaining posts**, about 320 hex literals. `token-storage-extra.mdx` (198),
   `embedding-layers.mdx` (83) and `model-db.mdx` (34) are most of it. Worth doing
   per post when that post is next edited rather than in one pass, because each
   one needs its charts looked at afterwards, in both themes.

The `token-search` migration is the worked example for item 2. The useful part was
not the mechanical swap: it was reading the post's charts together first to find
what each colour actually meant, which is how the two collisions surfaced.

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import LineChart from './LineChart'
import { vizPalette } from '../lib/viz-palette'

/*
 * PostingCurves: the posting-list size distribution as a continuous curve
 * instead of stacked histogram shares.
 *
 * Three views over the same pooled 12-NanoBEIR index (data written by
 * token_search/freq_histogram.py --curve):
 *
 *   "by rank"       x = rank by doc-frequency, y = doc-frequency, log-log. Every
 *                   analyzer overlays on one axes, and the area under each curve
 *                   IS its total posting entries, so the traversal cost is the
 *                   shape rather than a stack of bucket shares. Char n-grams
 *                   read as a flat plateau then a cliff. Word drops to the df=1
 *                   floor and runs along it for its last two-thirds.
 *
 *   "by token ID"   x = raw BPE token ID, y = doc-frequency. BPE only, since a
 *                   word or char n-gram has no ID. Shows how well merge order
 *                   ranks rarity on a corpus the tokenizer never saw. IDs below
 *                   256 are the byte fallback rather than learned merges, which
 *                   is the trough on the left: printable ASCII bytes sit in
 *                   nearly every document, lone non-ASCII bytes in almost none.
 *                   The quoted rho covers ID >= 256.
 *
 *   "by +freq rank" the same tokens against the +freq rank-remap from
 *                   blog/token-storage.mdx (ID -> descending-frequency rank).
 *                   The table is built HELD OUT on that post's C4 prose corpus,
 *                   which is what a deployed static rank table is, so this is
 *                   not the in-sample ceiling. Same x range, so toggling
 *                   between this and "by token ID" compares the two orderings.
 *
 * In both ID views the ribbon is the p25-p75 doc-frequency spread inside each
 * log-spaced bin, and hovering a bin gives its example tokens.
 */

const DATA_URL = '/static/data/token-search-curves.json'

// One colour means one thing across the whole post. The old list broke that twice:
// #38bdf8 was "char trigram" here and "r50k" in the chart below, and #10b981 was
// both "normalized" and "o200k". Roles keep the two charts consistent.
//
// Six lines are three families of two: the word baselines take the greys, the BPE
// pair takes green with naive on the reserved red because it is the one that
// fails, and the char n-grams take blue. See chart-style.md.
const seriesFor = (P) => [
  ['word', 'word', P.muted],
  ['word+stem', 'word+stem', P.mutedAlt],
  ['naive_o200k', 'naive', P.bad],
  ['norm_o200k', 'normalized', P.series[0]],
  ['char2', 'char bigram', P.seriesAlt[1]],
  ['char3', 'char trigram', P.series[1]],
]
// r50k and o200k are one tokenizer at two vocabulary sizes, so they are one hue
// with its second step rather than two unrelated colours.
const idSeriesFor = (P) => [
  ['r50k', 'r50k (50k)', P.seriesAlt[0]],
  ['o200k', 'o200k (200k)', P.series[0]],
]
const LOG_TICKS = [
  [1, '1'],
  [10, '10'],
  [100, '100'],
  [1000, '1k'],
  [10000, '10k'],
  [100000, '100k'],
]
const fmt = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n)
const rho = (c) => (c.spearman_merges ?? c.spearman).toFixed(2)

export default function PostingCurves({ height = 460 }) {
  const [data, setData] = useState(null)
  // LineChart owns the view toggle, but the caption differs per view, so mirror
  // the selection here and let one set of buttons drive both.
  const [view, setView] = useState(0)
  // Colour follows the theme, so it resolves at render rather than module load.
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const P = vizPalette(mounted && resolvedTheme === 'dark')

  useEffect(() => {
    let live = true
    fetch(DATA_URL)
      .then((r) => r.json())
      .then((j) => live && setData(j))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  // by_id arrived with the +freq orderings; a cached older payload only has the
  // rank curves, so render those rather than throwing.
  if (!data || !data.rank) return <div style={{ minHeight: height + 90, margin: '1.5rem 0' }} />
  const byId = data.by_id

  const rankSeries = seriesFor(P)
    .filter(([k]) => data.rank[k])
    .map(([k, name, color]) => ({
      name,
      color,
      showMarkers: false,
      width: 2,
      points: data.rank[k].points,
    }))

  // One dataset per tokenizer treatment, each holding both vocab sizes, so the
  // r50k / o200k contrast stays side by side while naive/normalized swaps.
  const idDatasets = (ordering) =>
    ['norm', 'naive']
      .map((mode) => ({
        label: mode === 'norm' ? 'normalized' : 'naive',
        series: idSeriesFor(P)
          .filter(([enc]) => byId[ordering]?.[`${mode}_${enc}`])
          .map(([enc, name, color]) => {
            const c = byId[ordering][`${mode}_${enc}`]
            return {
              name: `${name} · ρ=${rho(c)}`,
              color,
              showMarkers: false,
              width: 2,
              points: c.points,
              band: c.band,
              notes: c.examples,
            }
          }),
      }))
      .filter((d) => d.series.length)

  const w = data.rank['word']
  const n = data.rank['norm_o200k']
  const raw = byId?.raw?.['norm_r50k']
  const self = byId?.self?.['norm_r50k']
  const CAPTIONS = [
    `Pooled ${fmt(data.docs)} docs over 12 NanoBEIR corpora. Word needs ${fmt(w.vocab)} terms ` +
      `for ${fmt(w.postings)} posting entries, normalized BPE ${fmt(n.vocab)} terms for ` +
      `${fmt(n.postings)}. Click a legend entry to isolate it.`,
    `Line is the median doc frequency per log-spaced token-ID bin, ribbon the p25-p75 spread ` +
      `inside it. Hover a bin for its example tokens. The trough below ID 256 is BPE's byte ` +
      `fallback, not learned merges: printable ASCII bytes land in nearly every document, lone ` +
      `non-ASCII bytes in almost none. ρ covers ID ≥ 256.`,
    `The +freq remap from the token-storage post, relabelling each token by its ` +
      `descending-frequency rank. The table is built on ${fmt(data.freq_tokens)} tokens of that ` +
      `post's C4 prose corpus and applied here unchanged, so this is a held-out static table, ` +
      `not an in-sample fit. Rebuilding it on this corpus instead would give ρ=${
        self ? rho(self) : '?'
      } against raw ID's ρ=${raw ? rho(raw) : '?'} (r50k, normalized).`,
  ]

  const idView = (label, ordering, title, xLabel) => ({
    label,
    title,
    xLabel,
    xScale: 'log',
    xTicks: LOG_TICKS,
    datasets: idDatasets(ordering),
  })

  return (
    <figure className="my-6">
      <LineChart
        height={height}
        onViewChange={setView}
        yScale="log"
        yLabel="documents containing the term (doc frequency, log)"
        yTicks={LOG_TICKS}
        views={[
          {
            label: 'by rank',
            xLabel: 'term rank by doc frequency (log)',
            xScale: 'log',
            xTicks: LOG_TICKS,
            title: 'Posting-list sizes as one curve per analyzer',
            series: rankSeries,
          },
          ...(byId
            ? [
                idView('by token ID', 'raw', 'Doc frequency by token ID', 'BPE token ID (log)'),
                idView(
                  'by +freq rank',
                  'freq',
                  'Doc frequency by +freq rank',
                  '+freq rank, held-out C4 table (log)'
                ),
              ]
            : []),
        ]}
      />
      <figcaption className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
        {CAPTIONS[view] ?? CAPTIONS[0]}
      </figcaption>
    </figure>
  )
}

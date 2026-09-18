import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import BarChart from './BarChart'
import { vizPalette } from '../lib/viz-palette'

// Per-query score distribution for the relevance-tail post, drawn as a <BarChart>
// so it reads as the same system as every other chart here. One view per metric.
//
// The exact-0 and exact-100 buckets are broken out of the 10-wide bins on purpose:
// a query that found nothing is a different animal from one that scored 4, and those
// two towers are what the mean is hiding.
//
// Scores are stored 0..1 and shown x100, the way IR papers report NDCG. The y axis is
// query COUNTS, not percentages, so the two axes can't be mistaken for each other.
//
// Data: dist_hist.py --dump (per-query ndcg@10 / recall@10 / recall@100).

const DATA_URL = '/static/data/relevance-tail.json'

const METRICS = [
  { key: 'ndcg10', stat: 'ndcg@10', label: 'NDCG@10' },
  { key: 'r10', stat: 'recall@10', label: 'recall@10' },
  { key: 'r100', stat: 'recall@100', label: 'recall@100' },
]

// np.histogram bins are half-open on the RIGHT, so [50,60) is where the exactly-50
// queries land. Label them that way rather than "(50,60]".
const EDGES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
const MID_LABELS = [
  '(0,10)',
  '[10,20)',
  '[20,30)',
  '[30,40)',
  '[40,50)',
  '[50,60)',
  '[60,70)',
  '[70,80)',
  '[80,90)',
  '[90,100)',
]
const CATS = ['=0', ...MID_LABELS, '=100']

// Tooltip headers say which metric the bucket belongs to, so a hovered bar reads
// "NDCG@10 = [10,20)" rather than a bare interval.
const catsFor = (label) => [
  `${label} = 0`,
  ...MID_LABELS.map((b) => `${label} = ${b}`),
  `${label} = 100`,
]

// scores live 0..1 in the data and are reported x100 everywhere a human reads them
const s100 = (v, d = 1) => (v * 100).toFixed(d)

// Palette comes from lib/viz-palette: percentiles share one ordered hue, status
// colours are reserved, and the mean is neutral ink because it's the claim under
// test rather than another series. Light/dark are separate validated steps.
const PALETTE = { light: vizPalette(false), dark: vizPalette(true) }

function buildView(rows, stats, mdef, C) {
  const n = rows.length
  const buckets = CATS.map(() => [])
  for (const r of rows) {
    const v = r[mdef.key]
    if (v <= 1e-9) buckets[0].push(r)
    else if (v >= 1 - 1e-9) buckets[CATS.length - 1].push(r)
    else {
      let i = EDGES.findIndex((e) => v < e)
      if (i < 0) i = EDGES.length - 1
      buckets[1 + i].push(r)
    }
  }

  const st = stats[mdef.stat]
  // which bucket does the mean fall in? that bar is the one the reader is told to trust
  let meanIdx = CATS.length - 1
  if (st.mean <= 1e-9) meanIdx = 0
  else if (st.mean < 1) {
    const i = EDGES.findIndex((e) => st.mean < e)
    meanIdx = 1 + (i < 0 ? EDGES.length - 1 : i)
  }

  const counts = buckets.map((b) => b.length)
  const nearMean = rows.filter((r) => Math.abs(r[mdef.key] - st.mean) <= 0.05).length

  // Where does a statistic sit on a bucketed axis? Proportional placement puts p50 =
  // 0.500 exactly on the [.4,.5)/[.5,.6) seam and p10 = 0 on the =0/(0,.1) seam, which
  // reads as belonging to neither bar. So bucket the statistic with the SAME half-open
  // rule as the data, then draw it inside that bucket. Several stats in one bucket fan
  // out across the band instead of stacking on one line.
  // score -> fractional category index: slot 0 is =0 and the last slot is =1.0,
  // so a score in (0,1) spans the MID_LABELS slots in between
  const at = (v) => 1 + Math.min(1, Math.max(0, v)) * MID_LABELS.length
  const bucketOf = (v) => {
    if (v <= 1e-9) return 0
    if (v >= 1 - 1e-9) return CATS.length - 1
    const i = EDGES.findIndex((e) => v < e)
    return 1 + (i < 0 ? EDGES.length - 1 : i)
  }
  // Markers sit in the bucket that holds them, so p50 = 50 doesn't land on the
  // [40,50)/[50,60) seam and read as belonging to neither bar. Several stats in one
  // bucket fan out across the band instead of stacking on one line.
  const wanted = [
    { v: st.p10, label: `p10 ${s100(st.p10)}`, color: C.p10 },
    { v: st.p25, label: `p25 ${s100(st.p25)}`, color: C.p25 },
    { v: st.p50, label: `p50 ${s100(st.p50)}`, color: C.p50 },
    { v: st.mean, label: `mean ${s100(st.mean)}`, color: C.mean },
  ]
  const byBucket = new Map()
  for (const w of wanted) {
    const b = bucketOf(w.v)
    if (!byBucket.has(b)) byBucket.set(b, [])
    byBucket.get(b).push(w)
  }
  const markers = []
  for (const [b, group] of byBucket) {
    group.forEach((w, j) => {
      markers.push({ ...w, at: b + (j + 1) / (group.length + 1), row: markers.length })
    })
  }

  // Five ticks placed by SCORE instead of one label per bar. The =0 and =100 bars each
  // hold a full slot, so the axis is linear across the ten interior bins with a slot of
  // padding at either end: 50 lands on the [40,50)/[50,60) edge and 25 through the
  // middle of [20,30), which is where those scores sit among the bars.
  const catTicks = [
    { at: 0.5, label: '0' },
    { at: at(0.25), label: '25' },
    { at: at(0.5), label: '50' },
    { at: at(0.75), label: '75' },
    { at: CATS.length - 0.5, label: '100' },
  ]

  return {
    label: mdef.label,
    title: `Per-query ${mdef.label}`,
    valueLabel: 'queries',
    catLabel: `${mdef.label} (x100)`,
    subtitle:
      `${n} queries, 12 NanoBEIR datasets · mean ${s100(st.mean)} · ` +
      `p50 ${s100(st.p50)} · p25 ${s100(st.p25)}`,
    categories: catsFor(mdef.label),
    catTicks,
    markers,
    series: [
      {
        name: 'queries',
        values: counts,
        colors: CATS.map((_, i) =>
          // the mean's bucket is not highlighted: the marker line already says where it
          // is, and an ink-bright bar would out-shout the failure bucket
          i === 0 ? C.bad : i === CATS.length - 1 ? C.good : C.neutral
        ),
        // Label only the two towers. Ten more numbers across the middle is noise, and
        // the gridlines already give the scale; hover has the exact count.
        text: counts.map((c, i) => (i === 0 || i === CATS.length - 1 ? `${c}` : '')),
        textPosition: 'outside',
        notes: buckets.map((b, i) => {
          const cnt = `${b.length} of ${n} queries`
          if (i === meanIdx) {
            return `${cnt}. The mean (${s100(
              st.mean
            )}) lands in this bar, and only ${nearMean} queries score within 5 of it`
          }
          if (i === 0) {
            return `${cnt} returned nothing relevant, e.g. ${b[0]?.ds}: ${b[0]?.q.slice(0, 70)}…`
          }
          if (i === CATS.length - 1) {
            return `${cnt} found every relevant doc, e.g. ${b[0]?.ds}: ${b[0]?.q.slice(0, 70)}…`
          }
          return b.length ? `${cnt}, e.g. ${b[0].ds}: ${b[0].q.slice(0, 70)}…` : '0 queries'
        }),
      },
    ],
  }
}

// Per-query delta buckets, symmetric around an exact-zero spike. Bucketing the CHANGE
// keeps the paired information: a query that went 100 -> 0 is a different event from one
// that never moved, and a net-zero bucket can hide 30 arrivals against 30 departures.
const D_NEG = [-1.0, -0.5, -0.3, -0.2, -0.1, 0]
const D_POS = [0, 0.1, 0.2, 0.3, 0.5, 1.0]
const D_CATS = [
  '−100..−50',
  '−50..−30',
  '−30..−20',
  '−20..−10',
  '−10..0',
  '=0',
  '0..+10',
  '+10..+20',
  '+20..+30',
  '+30..+50',
  '+50..+100',
]
const ZERO_IDX = 5

// `compare` mode answers "how much does a query change", not "how did the summary move".
// Those are different questions: the delta of the medians is +10.0 on recall@10, while
// the median of the deltas is 0, because 460 of 599 queries never move at all.
// Reference lines that land on the same spot become one pill listing every
// statistic that shares it, e.g. "p25 p50 +0.0". Stacking identical pills would
// read as three findings instead of one.
function mergeMarkers(specs, at, fmt) {
  const groups = []
  for (const sp of specs) {
    const pos = at(sp.v)
    const g = groups.find((x) => Math.abs(x.pos - pos) < 1e-6)
    if (g) g.names.push(sp.name)
    else groups.push({ pos, names: [sp.name], color: sp.color, v: sp.v })
  }
  return groups.map((g, i) => ({
    at: g.pos,
    label: `${g.names.join(' ')} ${fmt(g.v)}`,
    color: g.color,
    row: i,
    side: i === 0 ? 'left' : undefined,
  }))
}

function buildCompareView(rows, stats, mdef, C) {
  const n = rows.length
  const enKey = `${mdef.key}_en`
  const deltas = rows.map((r) => r[enKey] - r[mdef.key])

  const bucketOf = (x) => {
    if (Math.abs(x) <= 1e-9) return ZERO_IDX
    if (x < 0) {
      for (let i = 0; i < D_NEG.length - 1; i++) if (x >= D_NEG[i] && x < D_NEG[i + 1]) return i
      return 0
    }
    for (let i = 0; i < D_POS.length - 1; i++) if (x > D_POS[i] && x <= D_POS[i + 1]) return 6 + i
    return D_CATS.length - 1
  }

  const buckets = D_CATS.map(() => [])
  rows.forEach((r, i) => buckets[bucketOf(deltas[i])].push({ r, d: deltas[i] }))
  const counts = buckets.map((b) => b.length)
  const win = deltas.filter((d) => d > 1e-9).length
  const loss = deltas.filter((d) => d < -1e-9).length

  // Linear-interpolated percentile, matching numpy, so the chart and the prose that
  // quotes these numbers can't drift apart.
  const sorted = [...deltas].sort((a, b) => a - b)
  const q = (p) => {
    const i = (p / 100) * (sorted.length - 1)
    const lo = Math.floor(i)
    const hi = Math.ceil(i)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo)
  }
  const st = stats[mdef.stat]
  const stEn = stats[`${mdef.stat}|word_en`]
  const meanD = stEn.mean - st.mean
  // deltas are reported x100 too, so +0.0191 reads as +1.9
  const fmt = (v) => (v >= 0 ? `+${(v * 100).toFixed(1)}` : (v * 100).toFixed(1))

  // A delta's position on this axis: the zero spike owns a whole slot, so the negative
  // buckets sit left of it and the positive ones right, each slot one bucket wide.
  const at = (x) => {
    const i = bucketOf(x)
    if (i === ZERO_IDX) return ZERO_IDX + 0.5
    const edges = x < 0 ? D_NEG : D_POS
    const j = x < 0 ? i : i - 6
    const lo = edges[j]
    const hi = edges[j + 1]
    return i + (hi === lo ? 0.5 : (x - lo) / (hi - lo))
  }

  return {
    label: mdef.label,
    title: `${mdef.label}: how much each query actually changed`,
    valueLabel: 'queries',
    catLabel: `change in ${mdef.label} (x100)`,
    subtitle:
      `${win} improved, ${loss} got worse, ${n - win - loss} never moved · ` +
      `mean Δ ${fmt(meanD)} but median Δ ${fmt(q(50))} · p10 Δ ${fmt(q(10))}`,
    categories: D_CATS.map((b) => (b === '=0' ? 'no change' : `Δ ${mdef.label} = ${b}`)),
    catTicks: [
      { at: 0, label: '−100' },
      { at: 4, label: '−10' },
      { at: ZERO_IDX + 0.5, label: 'no change' },
      { at: 7, label: '+10' },
      { at: D_CATS.length, label: '+100' },
    ],
    // On recall@100 the tie block runs from about p5 to p86, so p10 and p50 land on
    // the same spot. Coincident markers merge into one pill rather than stacking two
    // identical ones, which makes that collapse the thing you see.
    // p90 wears the second grey: it's a reference bound, and the argument is about
    // the low tail. Using the ramp's p50 green here would clash with the median.
    markers: mergeMarkers(
      [
        { v: q(10), name: 'p10', color: C.p10 },
        { v: meanD, name: 'mean', color: C.mean },
        // p50 sits below the mean: the two land within a bucket of each other on
        // every metric, so the row order is what keeps their pills apart.
        { v: q(50), name: 'p50', color: C.p50 },
        { v: q(90), name: 'p90', color: C.mutedAlt },
      ],
      at,
      fmt
    ),
    series: [
      {
        name: 'queries',
        values: counts,
        color: C.neutral,
        colors: D_CATS.map((_, i) => (i < ZERO_IDX ? C.bad : i === ZERO_IDX ? C.neutral : C.good)),
        text: counts.map((c) => (c ? `${c}` : '')),
        textPosition: 'outside',
        notes: buckets.map((b, i) => {
          if (!b.length) return 'no queries'
          const worst = b.reduce((a, x) => (x.d < a.d ? x : a), b[0])
          const best = b.reduce((a, x) => (x.d > a.d ? x : a), b[0])
          const pick = i < ZERO_IDX ? worst : best
          if (i === ZERO_IDX) return `${b.length} queries scored exactly the same either way`
          return (
            `${b.length} queries, e.g. ${pick.r.ds}: ${pick.r.q.slice(0, 60)}… ` +
            `(${s100(pick.r[mdef.key])} → ${s100(pick.r[enKey])})`
          )
        }),
      },
    ],
  }
}

export default function ScoreHistogram({ compare = false }) {
  const [data, setData] = useState(null)
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const C = PALETTE[mounted && resolvedTheme === 'dark' ? 'dark' : 'light']

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

  if (!data) return <div style={{ minHeight: 420, margin: '1.5rem 0' }} />

  const views = METRICS.map((mdef) =>
    compare
      ? buildCompareView(data.rows, data.stats, mdef, C)
      : buildView(data.rows, data.stats, mdef, C)
  )

  // No shared valueMax: recall@100's 351-query tower would squash the other two views
  // into the bottom third. Each view scales to its own data, and the counts on each bar
  // carry the comparison.
  return <BarChart orientation="vertical" valueLabel="queries" views={views} />
}

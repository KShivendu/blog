import { useEffect, useState } from 'react'
import BarChart from './BarChart'

// Per-query score distribution for the relevance-tail post, drawn as a <BarChart>
// so it reads as the same system as every other chart here. One view per metric.
//
// The exact-0 and exact-1.0 buckets are broken out of the 0.1-wide bins on purpose:
// a query that found nothing is a different animal from one that scored 0.04, and
// those two towers are what the mean is hiding.
//
// Data: dist_hist.py --dump (per-query ndcg@10 / recall@10 / recall@100).

const DATA_URL = '/static/data/relevance-tail.json'

const METRICS = [
  { key: 'ndcg10', stat: 'ndcg@10', label: 'NDCG@10' },
  { key: 'r10', stat: 'recall@10', label: 'recall@10' },
  { key: 'r100', stat: 'recall@100', label: 'recall@100' },
]

// np.histogram bins are half-open on the RIGHT, so [.5,.6) is where the
// exactly-0.500 queries land. Label them that way rather than "(.5,.6]".
const EDGES = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
const MID_LABELS = [
  '(0,.1)',
  '[.1,.2)',
  '[.2,.3)',
  '[.3,.4)',
  '[.4,.5)',
  '[.5,.6)',
  '[.6,.7)',
  '[.7,.8)',
  '[.8,.9)',
  '[.9,1)',
]
const CATS = ['=0', ...MID_LABELS, '=1.0']

const COLORS = {
  zero: '#f87171', // found nothing
  one: '#10b981', // perfect
  mid: '#94a3b8',
  mean: '#f59e0b', // the mean, and the bucket it falls in
  p50: '#0d9488',
  p25: '#8b5cf6',
  p10: '#f87171',
}

function buildView(rows, stats, mdef) {
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

  const pct = buckets.map((b) => Math.round((b.length / n) * 1000) / 10)
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
  const wanted = [
    { v: st.p10, label: `p10 ${st.p10.toFixed(2)}`, color: COLORS.p10 },
    { v: st.p25, label: `p25 ${st.p25.toFixed(2)}`, color: COLORS.p25 },
    { v: st.p50, label: `p50 ${st.p50.toFixed(2)}`, color: COLORS.p50 },
    { v: st.mean, label: `mean ${st.mean.toFixed(3)}`, color: COLORS.mean, strong: true },
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
      markers.push({
        ...w,
        at: b + (j + 1) / (group.length + 1),
        row: markers.length,
      })
    })
  }

  // Five ticks placed by SCORE instead of one label per bar. The =0 and =1.0 bars
  // each hold a full slot, so the axis is linear across the ten interior bins with a
  // slot of padding at either end: 0.50 lands on the [.4,.5)/[.5,.6) edge and 0.25
  // through the middle of [.2,.3), which is where those scores sit among the bars.
  const catTicks = [
    { at: 0.5, label: '0' },
    { at: at(0.25), label: '0.25' },
    { at: at(0.5), label: '0.50' },
    { at: at(0.75), label: '0.75' },
    { at: CATS.length - 0.5, label: '1.0' },
  ]

  return {
    label: mdef.label,
    title: `Per-query ${mdef.label}: the distribution the mean stands on`,
    subtitle:
      `${n} queries, 12 NanoBEIR datasets · mean ${st.mean.toFixed(3)} · ` +
      `p50 ${st.p50.toFixed(3)} · p25 ${st.p25.toFixed(3)} · p10 ${st.p10.toFixed(3)}`,
    categories: CATS,
    catTicks,
    markers,
    series: [
      {
        name: '% of queries',
        values: pct,
        colors: CATS.map((_, i) =>
          i === 0
            ? COLORS.zero
            : i === CATS.length - 1
            ? COLORS.one
            : i === meanIdx
            ? COLORS.mean
            : COLORS.mid
        ),
        text: pct.map((p) => (p >= 0.05 ? p.toFixed(p >= 10 ? 0 : 1) : '')),
        textPosition: 'outside',
        notes: buckets.map((b, i) => {
          const cnt = `${b.length} of ${n} queries`
          if (i === meanIdx) {
            return `${cnt} — the mean (${st.mean.toFixed(
              3
            )}) lands in this bar; only ${nearMean} queries score within ±0.05 of it`
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

export default function ScoreHistogram() {
  const [data, setData] = useState(null)

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

  const views = METRICS.map((mdef) => buildView(data.rows, data.stats, mdef))

  // No shared valueMax: recall@100's 59% tower would squash the other two views into
  // the bottom third. Each view scales to its own data; the % labels carry the compare.
  return <BarChart orientation="vertical" valueLabel="% of queries" valueUnit="%" views={views} />
}

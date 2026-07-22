import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import LineChart from './LineChart'

// Thin data-loading wrappers around the blog's hand-built SVG <LineChart>. Each
// fetches the real experiment JSON (public/static/data/latency-throughput.json)
// and shapes it into LineChart series — so the plateau, the cliff, and the bad
// harness are all drawn by the same crosshair/tooltip/log-axis SVG the rest of
// the blog uses, driven entirely by measured data. Theme handling and hover
// live inside LineChart itself.

const DATA_URL = '/static/data/latency-throughput.json'

function useLoadTest() {
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
  return data
}

const placeholder = <div style={{ minHeight: 420, margin: '1.5rem 0' }} />

// ── Closed-loop: throughput plateau (+ latency climb) vs concurrency p ──────────
export function ClosedLoopChart() {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const data = useLoadTest()
  if (!data) return placeholder
  const cl = data.closed_loop
  const cap = data.params.capacity_rps
  const P = cl.map((r) => r.p)
  const pt = (key) => cl.map((r) => [r.p, r[key]])
  const green = dark ? '#34d399' : '#047857'

  return (
    <LineChart
      title="Closed-loop: throughput plateaus, latency climbs"
      xLabel="concurrency p (workers, log scale)"
      xScale="log"
      xTicks={P.map((p) => [p, String(p)])}
      views={[
        {
          label: 'throughput',
          yLabel: 'achieved throughput (req/s)',
          yUnit: ' rps',
          yMin: 0,
          yTipDecimals: 0,
          series: [
            {
              name: 'achieved throughput',
              color: 'accent',
              marker: 'circle',
              points: pt('throughput'),
            },
            {
              name: `server capacity ≈ ${cap.toFixed(0)} rps`,
              color: '#94a3b8',
              dashed: true,
              showMarkers: false,
              points: [
                [P[0], cap],
                [P[P.length - 1], cap],
              ],
            },
          ],
        },
        {
          label: 'latency',
          yLabel: 'latency (ms, log scale)',
          yScale: 'log',
          yUnit: ' ms',
          yTipDecimals: 0,
          series: [
            { name: 'p50', color: green, marker: 'circle', points: pt('p50') },
            { name: 'p90', color: '#0891b2', marker: 'square', points: pt('p90') },
            { name: 'p99', color: '#7048e8', marker: 'diamond', points: pt('p99') },
          ],
        },
      ]}
    />
  )
}

// ── Open-loop: latency stays flat, then cliffs the instant λ > capacity ─────────
export function OpenLoopChart() {
  const data = useLoadTest()
  if (!data) return placeholder
  const ol = data.open_loop
  const cap = data.params.capacity_rps
  const off = (key) => ol.map((r) => [r.offered, r[key]])

  return (
    <LineChart
      title="Open-loop: the latency cliff at capacity"
      xLabel="offered arrival rate λ (req/s)"
      xTicks={[100, 200, 300, 400, 500].map((v) => [v, String(v)])}
      views={[
        {
          label: 'latency',
          yLabel: 'true latency (ms, log scale)',
          yScale: 'log',
          yUnit: ' ms',
          yMin: 20,
          yMax: 5000,
          yTipDecimals: 0,
          series: [
            {
              name: 'p50 (from intended send)',
              color: 'accent',
              marker: 'circle',
              points: off('p50'),
            },
            {
              name: 'p99 (from intended send)',
              color: '#dc2626',
              marker: 'diamond',
              points: off('p99'),
            },
            {
              name: `capacity ≈ ${cap.toFixed(0)} rps`,
              color: '#94a3b8',
              dashed: true,
              showMarkers: false,
              points: [
                [cap, 20],
                [cap, 5000],
              ],
            },
          ],
        },
        {
          label: 'throughput',
          yLabel: 'throughput (req/s)',
          yUnit: ' rps',
          yMin: 0,
          yTipDecimals: 0,
          series: [
            {
              name: 'offered (what you asked for)',
              color: '#94a3b8',
              dashed: true,
              showMarkers: false,
              points: off('offered'),
            },
            {
              name: 'achieved (what you got)',
              color: 'accent',
              marker: 'circle',
              points: off('achieved'),
            },
            {
              name: `capacity ≈ ${cap.toFixed(0)} rps`,
              color: '#dc2626',
              dashed: true,
              showMarkers: false,
              points: [
                [ol[0].offered, cap],
                [ol[ol.length - 1].offered, cap],
              ],
            },
          ],
        },
      ]}
    />
  )
}

// ── Bad harness: a small client pool over an added RTT invents a false cliff ────
export function BadHarnessChart() {
  const data = useLoadTest()
  if (!data || !data.bad_harness) return placeholder
  const bh = data.bad_harness
  const tcap = bh.transport_cap_rps
  const scap = data.params.capacity_rps
  const pts = bh.points.map((r) => [r.offered, r.p99])

  return (
    <LineChart
      title="A bad harness manufactures a cliff the engine never had"
      xLabel="offered arrival rate λ (req/s)"
      yLabel="true p99 latency (ms, log scale)"
      yScale="log"
      yUnit=" ms"
      yMin={80}
      yMax={20000}
      yTipDecimals={0}
      xTicks={[30, 60, 100, 140, 180, 240].map((v) => [v, String(v)])}
      series={[
        { name: 'p99 over a 75ms link, pool=8', color: '#dc2626', marker: 'diamond', points: pts },
        {
          name: `transport cap ≈ ${tcap.toFixed(0)} rps (server can do ${scap.toFixed(0)})`,
          color: '#94a3b8',
          dashed: true,
          showMarkers: false,
          points: [
            [tcap, 80],
            [tcap, 20000],
          ],
        },
      ]}
    />
  )
}

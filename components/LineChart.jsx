import dynamic from 'next/dynamic'
import { useRef, useState } from 'react'
import { useTheme } from 'next-themes'

/*
 * LineChart — hand-rolled SVG line chart for the blog.
 *
 * A lightweight, theme-aware replacement for <PlotlyChart> that draws plain
 * inline SVG (no chart library). Design language borrowed from the tpuf and
 * memory-bench reports: hairline gridlines, monospace tick labels, sans axis
 * titles, filled markers with distinct shapes, dashed fit/reference overlays,
 * a click-to-toggle legend, and a cursor-following dark tooltip.
 *
 * ── Prop API ────────────────────────────────────────────────────────────────
 *   title      string   chart title (drawn top-centre inside the SVG)
 *   xLabel     string   x-axis title
 *   yLabel     string   y-axis title
 *   xScale     'linear' | 'log'   (default 'linear')
 *   yScale     'linear' | 'log'   (default 'linear')
 *   xTicks     Array    explicit x ticks. Each entry is either a number
 *                       (auto-formatted) or a [value, label] pair.
 *   yTicks     Array    explicit y ticks (same shape). Omit to auto-generate.
 *   xMin/xMax/yMin/yMax  number   optional domain overrides
 *   xUnit/yUnit  string  suffix appended to tooltip values (e.g. ' ms')
 *   yTipDecimals number  decimal places for the y value in the tooltip
 *                        (default 2; raise for fine-grained metrics like NDCG)
 *   height     number   SVG height in px (default 440); width fills container
 *   series     Array of {
 *       name        string
 *       color       string       CSS colour (falls back to a palette)
 *       marker      'circle' | 'square' | 'triangle' | 'diamond' | 'ring' | 'star'
 *       dashed      boolean       draw the line dashed (fit / reference lines)
 *       showLine    boolean       default true (set false for a scatter/markers-
 *                                 only series with no connecting line)
 *       showMarkers boolean       default true (set false for smooth fit lines)
 *       width       number        line width (default 2, dashed → 1.5)
 *       points      Array<[x, y]> the data; series may have different lengths
 *       text        Array<string> optional per-point label drawn next to the
 *                                 marker ('' or null = no label)
 *       textPositions Array<string> optional per-point placement, one of
 *                                 'top left' | 'top right' | 'bottom left' |
 *                                 'bottom right' | 'top' | 'bottom' | 'left' |
 *                                 'right' (default 'top right')
 *       textPosition  string      single fallback placement for all points
 *   }
 *   views      Array of { label, series, yLabel, yScale, yTicks, yUnit,
 *              yMin, yMax, yTipDecimals, datasets }   optional on-theme
 *              toggle (top right) switching the whole y-axis + series set
 *              while keeping the shared x-axis in place — e.g. one chart,
 *              three buttons for "encode" / "decode" / "ratio", each with
 *              its own scale and unit. Any field omitted in a view falls
 *              back to the matching top-level prop. The first view is shown
 *              by default.
 *   views[].datasets   Array of { label, series }   optional SECOND,
 *              independent toggle (top left, smaller/lighter) nested inside
 *              a view — e.g. "prose" / "code" / "hindi" — for when the same
 *              metric needs to be split by another dimension. Only `series`
 *              varies per dataset; yLabel/yScale/yTicks/yUnit stay fixed at
 *              the view level since they describe the metric, not the
 *              dataset. The dataset selection persists across metric
 *              switches (it's an orthogonal axis, not a reset per view).
 *
 * ── Example (brute-force latency vs N, fp32 + bq + O(N) fit) ─────────────────
 *   <LineChart
 *     title="Brute-force search latency vs dataset size (256-dim)"
 *     xLabel="dataset size (vectors)"
 *     yLabel="server p50 latency (ms)"
 *     xScale="log" yScale="log" yUnit=" ms"
 *     xTicks={[[100000,'100k'],[200000,'200k'],[500000,'500k'],
 *              [1000000,'1M'],[2000000,'2M'],[5000000,'5M'],[10000000,'10M']]}
 *     series={[
 *       { name:'fp32 full scan', color:'#d6336c', marker:'circle',
 *         points:[[100000,33.2],[200000,76.1],[500000,185.5],[1000000,365.3],
 *                 [2000000,438.0],[5000000,1849.3],[10000000,1197.4]] },
 *       { name:'binary quant', color:'#1c7ed6', marker:'square',
 *         points:[[100000,1.6],[200000,28.7],[500000,85.5],[1000000,147.1],
 *                 [2000000,192.5],[5000000,281.5],[10000000,466.5]] },
 *       { name:'O(N) fit (100k–1M)', color:'#adb5bd', dashed:true, showMarkers:false,
 *         points:[[100000,36.6],[200000,73.3],[500000,183.2],[1000000,366.4],
 *                 [2000000,732.8],[5000000,1832.1],[10000000,3664.2]] },
 *     ]}
 *   />
 */

// Categorical palette, led by the Teletype-v2 terminal-green accent. First entry
// is swapped to the lighter dark-accent (#34d399) in dark mode (see colorsFor).
const DEFAULT_COLORS = ['#047857', '#0891b2', '#7048e8', '#0d9488', '#64748b', '#2563eb']
const VIEW_W = 760

// Theme-aware categorical: use the lighter green as the lead colour in dark.
function colorsFor(isDark) {
  return isDark ? ['#34d399', ...DEFAULT_COLORS.slice(1)] : DEFAULT_COLORS
}

function palette(isDark) {
  // Teletype-v2 neutrals + Graticule's faint plot gridline (matches page grid).
  return isDark
    ? {
        ink: '#dde6e0',
        muted: '#8a968e',
        grid: '#141922',
        axis: '#38473e',
        tip: '#0a0f0d',
        border: '#1e2822',
        card: '#0d1310',
      }
    : {
        ink: '#14161a',
        muted: '#5f6570',
        grid: '#eef1f6',
        axis: '#c8cfc9',
        tip: '#14161a',
        border: '#e0e4e1',
        card: '#ffffff',
      }
}

// 1-2-5 decade ticks within [lo, hi] — the helper used by both reference reports.
function logTicks(lo, hi) {
  const out = []
  for (let k = Math.floor(Math.log10(lo)); k <= Math.ceil(Math.log10(hi)); k++) {
    for (const b of [1, 2, 5]) {
      const v = b * 10 ** k
      if (v >= lo * 0.95 && v <= hi * 1.05) out.push(v)
    }
  }
  return out
}

function niceLinearTicks(lo, hi, count = 5) {
  const span = hi - lo || 1
  const step0 = span / count
  const mag = 10 ** Math.floor(Math.log10(step0))
  const norm = step0 / mag
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag
  const start = Math.ceil(lo / step) * step
  const out = []
  for (let v = start; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(6))
  return out
}

function trim(v) {
  return +v.toFixed(2) + ''
}

function fmtNum(v) {
  const a = Math.abs(v)
  if (a >= 1e6) return trim(v / 1e6) + 'M'
  if (a >= 1e3) return trim(v / 1e3) + 'k'
  return trim(v)
}

// Normalise a ticks array of numbers | [value, label] into {v, label} objects.
function normTicks(ticks) {
  return ticks.map((t) =>
    Array.isArray(t) ? { v: t[0], label: t[1] } : { v: t, label: fmtNum(t) }
  )
}

function makeScale(type, [d0, d1], [r0, r1]) {
  if (type === 'log') {
    const l0 = Math.log10(d0)
    const l1 = Math.log10(d1)
    return (v) => r0 + ((Math.log10(v) - l0) / (l1 - l0)) * (r1 - r0)
  }
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)
}

function markerNode(shape, x, y, s, color, key, opts = {}) {
  const common = { key, fill: color, ...opts }
  switch (shape) {
    case 'square':
      return <rect x={x - s} y={y - s} width={2 * s} height={2 * s} rx={1} {...common} />
    case 'triangle': {
      const h = s * 1.3
      return (
        <path
          d={`M${x} ${y - h} L${x + h} ${y + h * 0.8} L${x - h} ${y + h * 0.8} Z`}
          {...common}
        />
      )
    }
    case 'diamond':
      return (
        <path
          d={`M${x} ${y - s * 1.35} L${x + s * 1.35} ${y} L${x} ${y + s * 1.35} L${
            x - s * 1.35
          } ${y} Z`}
          {...common}
        />
      )
    case 'star': {
      const spikes = 5
      const outer = s * 1.55
      const inner = s * 0.62
      let d = ''
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outer : inner
        const ang = (Math.PI / spikes) * i - Math.PI / 2
        d += `${i === 0 ? 'M' : 'L'}${(x + r * Math.cos(ang)).toFixed(2)} ${(
          y +
          r * Math.sin(ang)
        ).toFixed(2)} `
      }
      return <path d={d + 'Z'} {...common} />
    }
    case 'ring':
      return (
        <circle
          cx={x}
          cy={y}
          r={s}
          fill="none"
          stroke={color}
          strokeWidth={2}
          key={key}
          {...opts}
        />
      )
    case 'circle':
    default:
      return <circle cx={x} cy={y} r={s} {...common} />
  }
}

function ChartImpl({
  title,
  xLabel,
  yLabel: yLabelProp,
  xScale = 'linear',
  yScale: yScaleProp = 'linear',
  xTicks,
  yTicks: yTicksProp,
  xMin,
  xMax,
  yMin: yMinProp,
  yMax: yMaxProp,
  xUnit = '',
  yUnit: yUnitProp = '',
  yTipDecimals: yTipDecimalsProp,
  height = 440,
  series: seriesProp = [],
  views,
}) {
  const { theme, resolvedTheme } = useTheme()
  const isDark = (resolvedTheme || theme) === 'dark'
  const C = palette(isDark)

  const tipRef = useRef(null)
  // Which series' point the cursor is actually closest to (by pixel distance,
  // not just x-bucket) -- with many series this is the difference between "a
  // dozen dots all lit up the same" and "the one you're pointing at, clearly."
  const [nearestName, setNearestName] = useState(null)
  const hLineRef = useRef(null)
  const activeXRef = useRef(null)
  const lockedRef = useRef(false) // click-to-lock: keep a point focused after leave
  const wrapRef = useRef(null) // outer wrapper — anchor for a locked tooltip
  const [activeX, setActiveX] = useState(null)
  const [hidden, setHidden] = useState(() => new Set())

  // ── views: an on-theme toggle switching the whole y-axis + series set (e.g.
  // encode / decode / ratio) while keeping the shared x-axis (chunk size) in
  // place — same pattern as BarChart's `views`, adapted for line charts since
  // each mode here needs its own scale/ticks/unit, not just different data.
  //
  // ── datasets: an optional SECOND, orthogonal toggle nested inside each view
  // (e.g. prose / code / hindi) — one independent state, so picking a dataset
  // sticks across metric switches instead of resetting. A view's yLabel/
  // yScale/yTicks/yUnit describe the METRIC and stay fixed across datasets;
  // only `series` swaps, so datasets only ever need to supply {label, series}.
  const [viewIdx, setViewIdx] = useState(0)
  const [datasetIdx, setDatasetIdx] = useState(0)
  const activeView = views && views.length ? views[Math.min(viewIdx, views.length - 1)] : null
  const activeDatasets = activeView?.datasets
  const activeDataset =
    activeDatasets && activeDatasets.length
      ? activeDatasets[Math.min(datasetIdx, activeDatasets.length - 1)]
      : null
  const yLabel = activeView?.yLabel ?? yLabelProp
  const yScale = activeView?.yScale ?? yScaleProp
  const yTicks = activeView?.yTicks ?? yTicksProp
  const yMin = activeView?.yMin ?? yMinProp
  const yMax = activeView?.yMax ?? yMaxProp
  const yUnit = activeView?.yUnit ?? yUnitProp
  const yTipDecimals = activeView?.yTipDecimals ?? yTipDecimalsProp
  const series = activeDataset?.series ?? activeView?.series ?? seriesProp

  const toggle = (name) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  // ── Tooltip: a fixed, cursor-following div updated imperatively (no re-render).
  const moveTip = (e) => {
    const t = tipRef.current
    if (!t) return
    t.style.left = Math.min(e.clientX + 14, window.innerWidth - 300) + 'px'
    t.style.top = Math.min(e.clientY + 14, window.innerHeight - 140) + 'px'
  }
  const showTip = (e, html) => {
    const t = tipRef.current
    if (!t) return
    t.innerHTML = html
    t.style.position = 'fixed' // cursor-following while hovering
    t.style.opacity = '1'
    moveTip(e)
  }
  // Locked tooltip: anchor it absolutely to the chart wrapper (near the point) so
  // it scrolls WITH the plot instead of floating off (fixed) on scroll. Clamp
  // inside the wrapper so it never spills past the plot.
  const lockTip = (markerEl, html) => {
    const t = tipRef.current
    const wrap = wrapRef.current
    if (!t || !wrap) return
    t.innerHTML = html
    t.style.position = 'absolute'
    t.style.opacity = '1'
    const mr = markerEl.getBoundingClientRect()
    const wr = wrap.getBoundingClientRect()
    const tw = t.offsetWidth || 200
    const th = t.offsetHeight || 80
    let left = mr.left - wr.left + mr.width / 2 + 12
    let top = mr.top - wr.top + mr.height / 2 + 12
    left = Math.max(4, Math.min(left, wrap.clientWidth - tw - 4))
    top = Math.max(4, Math.min(top, wrap.clientHeight - th - 4))
    t.style.left = left + 'px'
    t.style.top = top + 'px'
  }
  const hideTip = () => {
    if (tipRef.current) tipRef.current.style.opacity = '0'
  }

  // ── Geometry ────────────────────────────────────────────────────────────
  const W = VIEW_W
  const H = height
  const m = { t: title ? 46 : 20, r: 22, b: 50, l: 62 }
  const pw = W - m.l - m.r
  const ph = H - m.t - m.b

  // Domain from ALL series (stable when toggling) + tick values.
  const xVals = []
  const yVals = []
  series.forEach((s) => (s.points || []).forEach(([x, y]) => (xVals.push(x), yVals.push(y))))
  if (xTicks) normTicks(xTicks).forEach((t) => xVals.push(t.v))
  if (yTicks) normTicks(yTicks).forEach((t) => yVals.push(t.v))

  const domain = (scale, vals, lo, hi) => {
    let d0 = lo != null ? lo : Math.min(...vals)
    let d1 = hi != null ? hi : Math.max(...vals)
    if (d0 === d1) d1 = d0 + 1
    if (scale === 'log') {
      if (lo == null) d0 /= 1.25
      if (hi == null) d1 *= 1.25
    } else if (d0 >= 0 && lo == null) {
      d0 = 0
      if (hi == null) d1 *= 1.08
    } else {
      const pad = (d1 - d0) * 0.08
      if (lo == null) d0 -= pad
      if (hi == null) d1 += pad
    }
    return [d0, d1]
  }

  const xDom = domain(xScale, xVals, xMin, xMax)
  const yDom = domain(yScale, yVals, yMin, yMax)
  const xS = makeScale(xScale, xDom, [m.l, m.l + pw])
  const yS = makeScale(yScale, yDom, [m.t + ph, m.t]) // inverted: y grows upward

  const xt = xTicks
    ? normTicks(xTicks)
    : normTicks(xScale === 'log' ? logTicks(...xDom) : niceLinearTicks(...xDom))
  const yt = yTicks
    ? normTicks(yTicks)
    : normTicks(yScale === 'log' ? logTicks(...yDom) : niceLinearTicks(...yDom))

  const xLabelFor = (v) => {
    if (xTicks) {
      const hit = normTicks(xTicks).find((t) => t.v === v)
      if (hit) return hit.label
    }
    return fmtNum(v)
  }
  const fmtTipY = (v) => (yTipDecimals != null ? v.toFixed(yTipDecimals) : trim(v)) + yUnit
  const esc = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')

  const CATS = colorsFor(isDark)
  // `color: 'accent'` opts a series into the theme-aware brand green
  // (#047857 light / #34d399 dark) — legible in both themes without hardcoding.
  const colorOf = (s, i) =>
    s.color === 'accent' ? (isDark ? '#34d399' : '#047857') : s.color || CATS[i % CATS.length]

  // ── Build SVG layers ─────────────────────────────────────────────────────
  const gridLayer = []
  yt.forEach((t, i) => {
    const y = yS(t.v)
    gridLayer.push(<line key={`yg${i}`} x1={m.l} y1={y} x2={m.l + pw} y2={y} stroke={C.grid} />)
    gridLayer.push(
      <text
        key={`yl${i}`}
        x={m.l - 8}
        y={y + 3.5}
        textAnchor="end"
        fontSize="10.5"
        fill={C.muted}
        fontFamily="var(--font-mono, ui-monospace, monospace)"
      >
        {t.label}
      </text>
    )
  })
  xt.forEach((t, i) => {
    const x = xS(t.v)
    gridLayer.push(<line key={`xg${i}`} x1={x} y1={m.t} x2={x} y2={m.t + ph} stroke={C.grid} />)
    gridLayer.push(
      <text
        key={`xl${i}`}
        x={x}
        y={m.t + ph + 16}
        textAnchor="middle"
        fontSize="10.5"
        fill={C.muted}
        fontFamily="var(--font-mono, ui-monospace, monospace)"
      >
        {t.label}
      </text>
    )
  })

  const seriesLayer = []
  const markerLayer = []
  const labelLayer = []
  // Invisible, oversized hit-targets drawn ON TOP of the crosshair overlay so
  // that hovering a data-point marker (not just its text label) selects that
  // exact point. Needed for scatter series (showLine:false) whose points can
  // share a near-identical x — the nearest-x crosshair snap alone can't reach
  // each one. For connected line series this simply reproduces the crosshair's
  // column tooltip when the cursor is right on a marker (no regression).
  const hitLayer = []
  // Per-point label placement → text anchor + pixel offsets from the marker.
  const placeLabel = (pos) => {
    const p = String(pos || 'top right')
    const top = /top/.test(p)
    const bottom = /bottom/.test(p)
    const left = /left/.test(p)
    const right = /right/.test(p)
    return {
      anchor: left ? 'end' : right ? 'start' : 'middle',
      dx: left ? -7 : right ? 7 : 0,
      dy: top ? -8 : bottom ? 14 : 4,
    }
  }
  series.forEach((s, si) => {
    if (hidden.has(s.name)) return
    const c = colorOf(s, si)
    const shape = s.marker || 'circle'
    const showLine = s.showLine !== false
    const showMarkers = s.showMarkers !== false
    const pts = (s.points || []).filter(([x, y]) => x != null && y != null)
    if (!pts.length) return

    if (showLine && pts.length > 1) {
      const d = 'M' + pts.map(([x, y]) => `${xS(x).toFixed(1)} ${yS(y).toFixed(1)}`).join(' L')
      seriesLayer.push(
        <path
          key={`line${si}`}
          d={d}
          fill="none"
          stroke={c}
          strokeWidth={s.width || (s.dashed ? 1.5 : 2)}
          strokeOpacity={s.dashed ? 0.9 : 0.9}
          strokeDasharray={s.dashed ? '6 4' : undefined}
          strokeLinejoin="round"
        />
      )
    }

    if (showMarkers) {
      pts.forEach(([x, y], pi) => {
        const px = xS(x)
        const py = yS(y)
        // Markers are non-interactive; the crosshair overlay drives all hover.
        // A hairline card-coloured halo keeps the marker crisp where the line
        // passes through it (turbopuffer's dots read cleanly the same way).
        const halo = shape === 'ring' ? {} : { stroke: C.card, strokeWidth: 1 }
        markerLayer.push(
          <g key={`mk${si}-${pi}`} style={{ pointerEvents: 'none' }}>
            {markerNode(shape, px, py, 4, c, `sym${si}-${pi}`, halo)}
          </g>
        )
        // Transparent hit-target — a small radius around the marker triggers the
        // same tooltip/highlight as the crosshair, anchored to THIS point's x.
        hitLayer.push(
          <circle
            key={`hit${si}-${pi}`}
            cx={px}
            cy={py}
            r={9}
            fill="transparent"
            style={{ cursor: 'pointer' }}
            onPointerEnter={(e) => onMarkerHover(e, x, py, s.name)}
            onPointerMove={(e) => onMarkerHover(e, x, py, s.name)}
            onPointerLeave={onCrosshairLeave}
            onClick={(e) => onMarkerClick(e, x, py, s.name)}
          />
        )
      })
    }

    // Per-point text labels (drawn regardless of showMarkers).
    if (s.text) {
      pts.forEach(([x, y], pi) => {
        const txt = s.text[pi]
        if (txt == null || txt === '') return
        const pos = (s.textPositions && s.textPositions[pi]) || s.textPosition
        const { anchor, dx, dy } = placeLabel(pos)
        labelLayer.push(
          <text
            key={`lb${si}-${pi}`}
            x={xS(x) + dx}
            y={yS(y) + dy}
            textAnchor={anchor}
            fontSize="11"
            fill={C.ink}
            fontFamily="var(--font-mono, ui-monospace, monospace)"
            style={{ pointerEvents: 'none' }}
          >
            {txt}
          </text>
        )
      })
    }
  })

  // ── Crosshair ─────────────────────────────────────────────────────────────
  // Union of every visible series' x-values (sorted), plus each x's pixel pos.
  // We snap the cursor to the nearest of these, so the readout only re-renders
  // when the snapped x changes (not per pixel). The horizontal follow-line and
  // tooltip position are updated imperatively via refs (no re-render).
  const visSeries = series
    .map((s, i) => ({ s, i, c: colorOf(s, i) }))
    .filter(({ s }) => !hidden.has(s.name))

  const xSet = new Set()
  visSeries.forEach(({ s }) =>
    (s.points || []).forEach(([x, y]) => {
      if (x != null && y != null) xSet.add(x)
    })
  )
  const unionXs = [...xSet].sort((a, b) => a - b)
  const unionPx = unionXs.map((x) => xS(x))

  const buildTipHtml = (ux, nearest) => {
    // Rows are ordered by value at this x (largest on top) so the readout
    // matches the vertical stacking of the lines at the crosshair, instead of
    // raw series order (which puts a low line above a high one). The nearest
    // row is bolded and highlighted.
    const rows = visSeries
      .map(({ s, c }) => {
        const pt = (s.points || []).find(([x]) => x === ux)
        return pt && pt[1] != null ? { s, c, y: pt[1] } : null
      })
      .filter(Boolean)
      .sort((a, b) => b.y - a.y)
      .map(({ s, c, y }) => {
        const isNear = s.name === nearest
        return (
          `<div style="display:flex;align-items:center;gap:6px;margin-top:3px;` +
          `padding:${isNear ? '2px 4px' : '0'};margin-left:${isNear ? '-4px' : '0'};` +
          `border-radius:4px;background:${isNear ? 'rgba(255,255,255,0.12)' : 'transparent'}">` +
          `<span style="display:inline-block;width:${isNear ? 11 : 9}px;height:${
            isNear ? 11 : 9
          }px;` +
          `border-radius:2px;background:${c};flex:none;` +
          `box-shadow:${isNear ? `0 0 0 2px rgba(255,255,255,0.5)` : 'none'}"></span>` +
          `<span style="flex:1 1 auto;font-weight:${isNear ? 700 : 400};` +
          `color:${isNear ? '#fff' : 'rgba(255,255,255,0.75)'}">${esc(s.name)}</span>` +
          `<b style="color:#fff;margin-left:10px;font-size:${isNear ? '1.05em' : '1em'}">` +
          `${esc(fmtTipY(y))}</b></div>`
        )
      })
      .join('')
    if (!rows) return ''
    return (
      `<div style="font-weight:600;color:#fff;padding-bottom:5px;margin-bottom:3px;` +
      `border-bottom:1px solid rgba(255,255,255,0.14)">` +
      // Just the x value + unit — the full axis title in the header is redundant.
      `${esc(xLabelFor(ux))}${esc(xUnit)}</div>` +
      rows
    )
  }

  const onCrosshairMove = (e) => {
    if (lockedRef.current) return
    if (!unionXs.length) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const px = ((e.clientX - rect.left) / rect.width) * W
    let bi = 0
    let bd = Infinity
    for (let i = 0; i < unionPx.length; i++) {
      const d = Math.abs(unionPx[i] - px)
      if (d < bd) {
        bd = d
        bi = i
      }
    }
    const ux = unionXs[bi]
    if (ux !== activeXRef.current) {
      activeXRef.current = ux
      setActiveX(ux)
    }
    // Which series is the cursor actually closest to at this x (pixel Y
    // distance, in the raw un-clamped cursor position) -- this is what makes
    // one point pop out of a dozen lookalikes instead of all lighting up
    // identically.
    const rawY = ((e.clientY - rect.top) / rect.height) * H
    let nearest = null
    let nearestDy = Infinity
    let nearestPy = null
    visSeries.forEach(({ s }) => {
      const pt = (s.points || []).find(([x]) => x === ux)
      if (!pt || pt[1] == null) return
      const py = yS(pt[1])
      const dy = Math.abs(py - rawY)
      if (dy < nearestDy) {
        nearestDy = dy
        nearest = s.name
        nearestPy = py
      }
    })
    if (nearest !== nearestName) setNearestName(nearest)
    // Horizontal follow-line snaps to the NEAREST point's actual y (not the
    // raw cursor y) so the dashed line visibly passes through the point
    // being highlighted, instead of just tracking the mouse.
    const hy = nearestPy != null ? nearestPy : Math.max(m.t, Math.min(m.t + ph, rawY))
    const hl = hLineRef.current
    if (hl) {
      hl.setAttribute('y1', hy)
      hl.setAttribute('y2', hy)
      hl.style.opacity = '0.45'
    }
    const html = buildTipHtml(ux, nearest)
    if (html) showTip(e, html)
    else hideTip()
  }

  const clearActive = () => {
    activeXRef.current = null
    setActiveX(null)
    setNearestName(null)
    if (hLineRef.current) hLineRef.current.style.opacity = '0'
    hideTip()
  }
  const onCrosshairLeave = () => {
    if (lockedRef.current) return // stay put while a point is locked
    clearActive()
  }

  // Hovering a marker's hit-target: snap the crosshair straight to that point's
  // x (bypassing the nearest-x search so clustered scatter points are each
  // reachable) and show the same tooltip. buildTipHtml(ux) lists every visible
  // series with a point at that x, so line series keep their column readout.
  // The hovered marker's OWN series is unambiguously "nearest" here — no
  // distance calculation needed like the general crosshair-move case.
  const onMarkerHover = (e, ux, py, name) => {
    if (lockedRef.current) return
    if (ux !== activeXRef.current) {
      activeXRef.current = ux
      setActiveX(ux)
    }
    if (name !== nearestName) setNearestName(name)
    const hl = hLineRef.current
    if (hl) {
      hl.setAttribute('y1', py)
      hl.setAttribute('y2', py)
      hl.style.opacity = '0.45'
    }
    const html = buildTipHtml(ux, name)
    if (html) showTip(e, html)
    else hideTip()
  }

  // Click a marker to LOCK focus on it (tooltip + highlight persist after the
  // pointer leaves). Click the same point again — or click empty plot — to unlock.
  const onMarkerClick = (e, ux, py, name) => {
    if (lockedRef.current && activeXRef.current === ux) {
      lockedRef.current = false
      clearActive()
      return
    }
    lockedRef.current = true
    activeXRef.current = ux
    setActiveX(ux)
    setNearestName(name)
    const hl = hLineRef.current
    if (hl) {
      hl.setAttribute('y1', py)
      hl.setAttribute('y2', py)
      hl.style.opacity = '0.45'
    }
    const html = buildTipHtml(ux, name)
    if (html) lockTip(e.currentTarget, html)
  }

  const legendSwatch = (s, i) => {
    const c = colorOf(s, i)
    return (
      <svg width="26" height="12" style={{ overflow: 'visible' }}>
        <line
          x1="1"
          y1="6"
          x2="25"
          y2="6"
          stroke={c}
          strokeWidth="2"
          strokeDasharray={s.dashed ? '4 3' : undefined}
        />
        {s.showMarkers !== false && markerNode(s.marker || 'circle', 13, 6, 4, c, 'lg')}
      </svg>
    )
  }

  return (
    <div className="line-chart" ref={wrapRef} style={{ margin: '1.5rem 0', position: 'relative' }}>
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 0,
          padding: '10px 10px 4px',
          background: C.card,
        }}
      >
        {((views && views.length > 1) || (activeDatasets && activeDatasets.length > 1)) && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
              padding: '2px 2px 6px',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          >
            {/* Secondary toggle (e.g. dataset): independent of the metric
                toggle, so the selection sticks when switching metrics. A
                lighter, smaller style keeps it visually subordinate to the
                primary toggle instead of the two competing for attention. */}
            <div style={{ display: 'flex' }}>
              {activeDatasets &&
                activeDatasets.length > 1 &&
                activeDatasets.map((d, i) => {
                  const on = i === Math.min(datasetIdx, activeDatasets.length - 1)
                  return (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => {
                        setDatasetIdx(i)
                        setActiveX(null)
                        lockedRef.current = false
                        hideTip()
                      }}
                      style={{
                        appearance: 'none',
                        cursor: 'pointer',
                        fontSize: '10px',
                        lineHeight: 1,
                        padding: '4px 9px',
                        border: `1px solid ${on ? C.muted : 'transparent'}`,
                        marginLeft: i === 0 ? 0 : '-1px',
                        background: 'transparent',
                        color: on ? C.ink : C.muted,
                        fontFamily: 'inherit',
                        fontWeight: on ? 600 : 400,
                        position: 'relative',
                      }}
                    >
                      {d.label}
                    </button>
                  )
                })}
            </div>
            {/* Primary toggle (metric): bold on-theme segmented buttons. */}
            <div style={{ display: 'flex' }}>
              {views &&
                views.length > 1 &&
                views.map((v, i) => {
                  const on = i === Math.min(viewIdx, views.length - 1)
                  return (
                    <button
                      key={v.label}
                      type="button"
                      onClick={() => {
                        setViewIdx(i)
                        setActiveX(null)
                        lockedRef.current = false
                        hideTip()
                      }}
                      style={{
                        appearance: 'none',
                        cursor: 'pointer',
                        fontSize: '11px',
                        lineHeight: 1,
                        padding: '5px 11px',
                        border: `1px solid ${on ? C.ink : C.border}`,
                        marginLeft: i === 0 ? 0 : '-1px',
                        background: on ? C.ink : 'transparent',
                        color: on ? C.card : C.muted,
                        fontFamily: 'inherit',
                        fontWeight: on ? 600 : 400,
                        zIndex: on ? 1 : 0,
                        position: 'relative',
                      }}
                    >
                      {v.label}
                    </button>
                  )
                })}
            </div>
          </div>
        )}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={title || 'chart'}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          {title && (
            <text
              x={m.l + pw / 2}
              y={26}
              textAnchor="middle"
              fontSize="15"
              fontWeight="600"
              fill={C.ink}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
            >
              {title}
            </text>
          )}
          {gridLayer}
          {/* faint plot frame (contained, like turbopuffer) + darker L/B axes */}
          <rect
            x={m.l}
            y={m.t}
            width={pw}
            height={ph}
            fill="none"
            stroke={C.grid}
            pointerEvents="none"
          />
          <line x1={m.l} y1={m.t} x2={m.l} y2={m.t + ph} stroke={C.axis} />
          <line x1={m.l} y1={m.t + ph} x2={m.l + pw} y2={m.t + ph} stroke={C.axis} />
          {seriesLayer}
          {markerLayer}
          {labelLayer}
          {/* Crosshair: vertical snapped line + emphasised points at active x */}
          {activeX != null &&
            (() => {
              const cx = xS(activeX)
              const nodes = [
                <line
                  key="cx-v"
                  x1={cx}
                  y1={m.t}
                  x2={cx}
                  y2={m.t + ph}
                  stroke={C.axis}
                  strokeWidth={1}
                  strokeOpacity={0.9}
                  pointerEvents="none"
                />,
              ]
              // Draw the non-nearest points first (dimmed, small, so they stay
              // legible as context) and the nearest one LAST (drawn on top, so
              // it's never occluded by a neighbour) with a much bigger, fully
              // opaque halo + a bright outer ring — the single point the
              // cursor is actually on should be unmistakable among ~10 others.
              const rest = []
              let nearestNode = null
              visSeries.forEach(({ s, i, c }) => {
                const pt = (s.points || []).find(([x]) => x === activeX)
                if (!pt || pt[1] == null) return
                const px = xS(pt[0])
                const py = yS(pt[1])
                const isNear = nearestName != null && s.name === nearestName
                if (isNear) {
                  nearestNode = (
                    <g key={`cx-near-${i}`} pointerEvents="none">
                      <circle
                        cx={px}
                        cy={py}
                        r={12}
                        fill="none"
                        stroke={c}
                        strokeOpacity={0.28}
                        strokeWidth={5}
                      />
                      <circle cx={px} cy={py} r={9} fill="none" stroke={C.card} strokeWidth={2.5} />
                      <circle cx={px} cy={py} r={9} fill="none" stroke={c} strokeWidth={1.75} />
                      {markerNode(s.marker || 'circle', px, py, 6, c, `cx-sym-${i}`, {
                        pointerEvents: 'none',
                      })}
                    </g>
                  )
                } else {
                  rest.push(
                    <circle
                      key={`cx-halo-${i}`}
                      cx={px}
                      cy={py}
                      r={6}
                      fill="none"
                      stroke={c}
                      strokeWidth={1.25}
                      strokeOpacity={nearestName != null ? 0.28 : 0.55}
                      pointerEvents="none"
                    />
                  )
                  rest.push(
                    markerNode(s.marker || 'circle', px, py, 3.5, c, `cx-sym-${i}`, {
                      pointerEvents: 'none',
                      opacity: nearestName != null ? 0.55 : 1,
                    })
                  )
                }
              })
              nodes.push(...rest)
              if (nearestNode) nodes.push(nearestNode)
              return <g>{nodes}</g>
            })()}
          {/* Faint horizontal follow-line (imperative y, no re-render) */}
          <line
            ref={hLineRef}
            x1={m.l}
            x2={m.l + pw}
            y1={m.t}
            y2={m.t}
            stroke={C.axis}
            strokeWidth={1}
            strokeDasharray="3 4"
            style={{ opacity: 0 }}
            pointerEvents="none"
          />
          {/* Transparent overlay: captures all pointer motion for the crosshair */}
          <rect
            x={m.l}
            y={m.t}
            width={pw}
            height={ph}
            fill="transparent"
            style={{ touchAction: 'none', cursor: 'crosshair' }}
            onPointerMove={onCrosshairMove}
            onPointerDown={onCrosshairMove}
            onPointerLeave={onCrosshairLeave}
            onPointerUp={onCrosshairLeave}
            onPointerCancel={onCrosshairLeave}
            onClick={() => {
              // Click on empty plot clears a locked point.
              if (lockedRef.current) {
                lockedRef.current = false
                clearActive()
              }
            }}
          />
          {/* Per-marker hit-targets on top of the overlay so a marker (or a small
              radius around it) is directly hoverable, even for clustered scatter
              points the nearest-x snap can't separate. */}
          {hitLayer}
          {xLabel && (
            <text
              x={m.l + pw / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize="12"
              fill={C.ink}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
            >
              {xLabel}
            </text>
          )}
          {yLabel && (
            <text
              transform={`translate(15 ${m.t + ph / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize="12"
              fill={C.ink}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
            >
              {yLabel}
            </text>
          )}
        </svg>

        {/* Legend — click a series to toggle it */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px 18px',
            justifyContent: 'center',
            padding: '6px 6px 8px',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: '12.5px',
          }}
        >
          {series.map((s, i) => {
            const off = hidden.has(s.name)
            return (
              <span
                key={s.name}
                onClick={() => toggle(s.name)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  opacity: off ? 0.35 : 1,
                  textDecoration: off ? 'line-through' : 'none',
                  color: C.ink,
                }}
              >
                {legendSwatch(s, i)}
                {s.name}
              </span>
            )
          })}
        </div>
      </div>

      {/* cursor-following tooltip */}
      <div
        ref={tipRef}
        style={{
          position: 'fixed',
          zIndex: 80,
          pointerEvents: 'none',
          background: C.tip,
          color: '#fff',
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          fontSize: '11.5px',
          lineHeight: 1.5,
          padding: '8px 11px',
          borderRadius: '7px',
          border: '1px solid rgba(255,255,255,0.14)',
          fontVariantNumeric: 'tabular-nums',
          opacity: 0,
          transition: 'opacity 0.08s',
          boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
          minWidth: '150px',
          maxWidth: '280px',
          left: 0,
          top: 0,
        }}
      />
    </div>
  )
}

// Match PlotlyChart: render client-side only (theme + tooltip need the DOM),
// avoiding SSR/hydration mismatches when embedded in MDX.
const LineChart = dynamic(() => Promise.resolve(ChartImpl), { ssr: false })

export default LineChart

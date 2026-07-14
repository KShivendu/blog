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
 *   height     number   SVG height in px (default 440); width fills container
 *   series     Array of {
 *       name        string
 *       color       string       CSS colour (falls back to a palette)
 *       marker      'circle' | 'square' | 'triangle' | 'diamond' | 'ring'
 *       dashed      boolean       draw the line dashed (fit / reference lines)
 *       showLine    boolean       default true
 *       showMarkers boolean       default true (set false for smooth fit lines)
 *       width       number        line width (default 2, dashed → 1.5)
 *       points      Array<[x, y]> the data; series may have different lengths
 *   }
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
  yLabel,
  xScale = 'linear',
  yScale = 'linear',
  xTicks,
  yTicks,
  xMin,
  xMax,
  yMin,
  yMax,
  xUnit = '',
  yUnit = '',
  height = 440,
  series = [],
}) {
  const { theme, resolvedTheme } = useTheme()
  const isDark = (resolvedTheme || theme) === 'dark'
  const C = palette(isDark)

  const tipRef = useRef(null)
  const hLineRef = useRef(null)
  const activeXRef = useRef(null)
  const [activeX, setActiveX] = useState(null)
  const [hidden, setHidden] = useState(() => new Set())

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
    t.style.opacity = '1'
    moveTip(e)
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
  const fmtTipY = (v) => trim(v) + yUnit
  const esc = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')

  const CATS = colorsFor(isDark)
  const colorOf = (s, i) => s.color || CATS[i % CATS.length]

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

  const buildTipHtml = (ux) => {
    const rows = visSeries
      .map(({ s, c }) => {
        const pt = (s.points || []).find(([x]) => x === ux)
        if (!pt || pt[1] == null) return ''
        return (
          `<div style="display:flex;align-items:center;gap:6px;margin-top:3px">` +
          `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${c};flex:none"></span>` +
          `<span style="flex:1 1 auto">${esc(s.name)}</span>` +
          `<b style="color:#fff;margin-left:10px">${esc(fmtTipY(pt[1]))}</b></div>`
        )
      })
      .filter(Boolean)
      .join('')
    if (!rows) return ''
    return (
      `<div style="font-weight:600;color:#fff;padding-bottom:5px;margin-bottom:3px;` +
      `border-bottom:1px solid rgba(255,255,255,0.14)">` +
      `${esc(xLabel || 'x')}: ${esc(xLabelFor(ux))}${esc(xUnit)}</div>` +
      rows
    )
  }

  const onCrosshairMove = (e) => {
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
    // Horizontal follow-line: imperative, clamped to the plot area.
    const hy = Math.max(m.t, Math.min(m.t + ph, ((e.clientY - rect.top) / rect.height) * H))
    const hl = hLineRef.current
    if (hl) {
      hl.setAttribute('y1', hy)
      hl.setAttribute('y2', hy)
      hl.style.opacity = '0.45'
    }
    const html = buildTipHtml(ux)
    if (html) showTip(e, html)
    else hideTip()
  }

  const onCrosshairLeave = () => {
    activeXRef.current = null
    setActiveX(null)
    if (hLineRef.current) hLineRef.current.style.opacity = '0'
    hideTip()
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
    <div className="line-chart" style={{ margin: '1.5rem 0' }}>
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 0,
          padding: '10px 10px 4px',
          background: C.card,
        }}
      >
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
              visSeries.forEach(({ s, i, c }) => {
                const pt = (s.points || []).find(([x]) => x === activeX)
                if (!pt || pt[1] == null) return
                const px = xS(pt[0])
                const py = yS(pt[1])
                nodes.push(
                  <circle
                    key={`cx-halo-${i}`}
                    cx={px}
                    cy={py}
                    r={7.5}
                    fill="none"
                    stroke={c}
                    strokeWidth={1.5}
                    strokeOpacity={0.55}
                    pointerEvents="none"
                  />
                )
                nodes.push(
                  markerNode(s.marker || 'circle', px, py, 4.5, c, `cx-sym-${i}`, {
                    pointerEvents: 'none',
                  })
                )
              })
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
          />
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

import dynamic from 'next/dynamic'
import { useRef, useState, useEffect } from 'react'
import { useTheme } from 'next-themes'

/*
 * BarChart — hand-rolled SVG bar chart for the blog.
 *
 * A lightweight, theme-aware sibling of <LineChart>. Draws plain inline SVG
 * (no chart library), sharing the same design language: hairline gridlines,
 * monospace (Geist Mono) tick/label text, the Teletype-v2 terminal-green
 * accent, a calm cursor-following dark tooltip, and a click/hover interaction
 * model. Supports horizontal + vertical orientation, grouped + stacked
 * multi-series, per-bar colours, value labels, a legend, and an on-theme
 * segmented toggle to switch between datasets ("views"), replacing Plotly's
 * `updatemenus` buttons.
 *
 * ── Prop API ────────────────────────────────────────────────────────────────
 *   orientation  'horizontal' | 'vertical'   (default 'vertical')
 *                horizontal → category axis is vertical, bars grow rightward.
 *   stacked      boolean   when true, series sharing a `group` key stack on
 *                          top of each other; distinct groups sit side-by-side
 *                          (grouped-stacked). When false, every series is drawn
 *                          side-by-side within each category cluster (grouped).
 *   title        string    chart title (top-centre)
 *   subtitle     string    smaller line under the title
 *   valueLabel   string    axis title for the value axis
 *   valueUnit    string    suffix for tooltip values (e.g. 'µs'); ignored for a
 *                          series/point that supplies explicit `text`
 *   valueScale   'linear' | 'log'   (default 'linear'). On a log value axis bars
 *                          grow from the axis floor (valueMin) up to their value;
 *                          intended for single-series charts (stacking a log axis
 *                          is not meaningful). Linear is unchanged / the default.
 *   valueMin     number    log only: the value-axis floor (bar base). Defaults to
 *                          the smallest provided valueTick, else dataMin.
 *   valueMax     number    optional value-axis max (else auto from data + pad)
 *   valueTicks   Array     explicit value-axis ticks. Each entry is a number
 *                          (auto-formatted) or a [value, label] pair. Else auto.
 *   height       number    SVG height in px. Horizontal auto-sizes from the
 *                          category count when omitted; vertical defaults 420.
 *   showLegend   boolean   default: true when >1 series, else false
 *   barGap       number    0..1 fraction of a category band left as padding
 *                          (default 0.22)
 *
 *   Data is supplied EITHER flat (categories + series) for a single view, OR as
 *   `views` for a toggle. A view is { label, categories, series }.
 *
 *   categories   Array<string>            category labels (one per bar cluster)
 *   series       Array<{
 *       name         string               legend/tooltip label
 *       values       Array<number>        one value per category
 *       color        string               single colour for the whole series
 *       colors       Array<string>        per-category colours (overrides color)
 *       opacity      number               single opacity (default 1)
 *       opacities    Array<number>        per-category opacity (overrides opacity)
 *       group        string               stack key (only used when stacked)
 *       text         Array<string>        per-bar label ('' = no label);
 *                                         also used verbatim in the tooltip
 *       textPosition 'inside' | 'outside' | 'none'  (default: outside for
 *                                         horizontal, inside for vertical)
 *       breakdown    Array<Array<{label, value}> | null>   per-category
 *                                         sub-components shown as extra
 *                                         indented lines in the tooltip under
 *                                         that bar's main row (e.g. a decode
 *                                         bar split into "decompress" +
 *                                         "tokenize"). Purely a tooltip
 *                                         annotation — doesn't affect the bar
 *                                         itself, which still just draws
 *                                         `values[ci]`.
 *   }>
 *   views        Array<{ label, categories, series }>   toggle datasets. The
 *                first is shown by default. Renders on-theme segmented buttons.
 *
 * ── Example: horizontal single-series with an All/Focus toggle ───────────────
 *   <BarChart
 *     orientation="horizontal"
 *     title="Median compression ratio"
 *     valueLabel="compression ratio (higher is better)"
 *     valueUnit="×" valueMax={4.2} valueTicks={[0,1,2,3,4]}
 *     views={[
 *       { label:'All', categories:['Raw UTF-8','LZ4'],
 *         series:[{ name:'ratio', values:[1.0,1.15],
 *                   colors:['#94a3b8','#94a3b8'], text:['1.0×','1.15×'] }] },
 *       { label:'Focus', categories:['Raw UTF-8'],
 *         series:[{ name:'ratio', values:[1.0], colors:['#94a3b8'],
 *                   text:['1.0×'] }] },
 *     ]}
 *   />
 *
 * ── Example: vertical grouped-stacked (encode/decode × raw/ANS) ──────────────
 *   <BarChart orientation="vertical" stacked valueLabel="microseconds"
 *     categories={['LZ4','r50k + ANS']}
 *     series={[
 *       { name:'encode (raw)',   group:'encode', color:'#60a5fa', values:[15,43] },
 *       { name:'decode (raw)',   group:'decode', color:'#10b981', values:[1,4]  },
 *       { name:'encode (+ ANS)', group:'encode', color:'#1d4ed8', values:[0,9]  },
 *       { name:'decode (+ ANS)', group:'decode', color:'#065f46', values:[0,15] },
 *     ]}
 *   />
 */

const VIEW_W = 760

// Teletype-v2 neutrals + faint plot gridline — mirrors LineChart's palette so
// the two chart types read as one system.
function palette(isDark) {
  return isDark
    ? {
        ink: '#dde6e0',
        muted: '#8a968e',
        grid: '#141922',
        axis: '#38473e',
        tip: '#0a0f0d',
        border: '#1e2822',
        card: '#0d1310',
        accent: '#34d399',
        accentInk: '#08110c',
      }
    : {
        ink: '#14161a',
        muted: '#5f6570',
        grid: '#eef1f6',
        axis: '#c8cfc9',
        tip: '#14161a',
        border: '#e0e4e1',
        card: '#ffffff',
        accent: '#047857',
        accentInk: '#ffffff',
      }
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

// Composite a colour drawn at `op` opacity over background `bg` (both #hex).
function blend(hex, op, bg) {
  const rd = (h) => {
    h = h.replace('#', '')
    if (h.length === 3)
      h = h
        .split('')
        .map((c) => c + c)
        .join('')
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  }
  if (op >= 1) return hex
  const f = rd(hex)
  const b = rd(bg)
  const mix = f.map((c, i) => Math.round(op * c + (1 - op) * b[i]))
  return '#' + mix.map((c) => c.toString(16).padStart(2, '0')).join('')
}

// Relative luminance → pick readable label ink on a coloured bar (WCAG-ish).
function readableInk(hex) {
  const h = hex.replace('#', '')
  const n =
    h.length === 3
      ? h
          .split('')
          .map((c) => c + c)
          .join('')
      : h
  const r = parseInt(n.slice(0, 2), 16) / 255
  const g = parseInt(n.slice(2, 4), 16) / 255
  const b = parseInt(n.slice(4, 6), 16) / 255
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  // Threshold tuned below the mid-tone blue/green fills (#60a5fa, #10b981 ≈ 0.36)
  // so they carry dark ink for AA contrast; only the deep fills get white.
  return L > 0.32 ? '#0a1410' : '#ffffff'
}

// Monospace truncation so long horizontal-bar labels never overrun their margin.
function truncate(label, maxPx, fontSize) {
  const cw = fontSize * 0.62
  const max = Math.max(3, Math.floor(maxPx / cw))
  return label.length > max ? label.slice(0, max - 1) + '…' : label
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

function ChartImpl({
  orientation = 'vertical',
  stacked = false,
  title,
  subtitle,
  valueLabel,
  valueUnit = '',
  valueScale = 'linear',
  valueMin,
  valueMax,
  valueTicks,
  height,
  showLegend,
  barGap = 0.22,
  categories,
  series,
  views,
}) {
  const { theme, resolvedTheme } = useTheme()
  const isDark = (resolvedTheme || theme) === 'dark'
  const C = palette(isDark)

  const tipRef = useRef(null)
  const [activeCat, setActiveCat] = useState(null)
  // Which grouped bar (by group key) the cursor is actually closest to, so
  // that one bar — not the whole hovered category — gets a visible outline.
  const [nearestKey, setNearestKey] = useState(null)
  // A view can opt into being the default via `default: true`, independent of
  // its position in the array (e.g. displayed as "Human | Agent" but Agent
  // is what should be selected first).
  const defaultViewIdx = views
    ? Math.max(
        0,
        views.findIndex((v) => v.default)
      )
    : 0
  const [viewIdx, setViewIdx] = useState(defaultViewIdx)
  // Secondary, independent toggle axis (e.g. dataset) nested under each view —
  // mirrors LineChart's views[].datasets so selection persists across views.
  const [datasetIdx, setDatasetIdx] = useState(0)
  // Third, independent toggle axis (e.g. All/Focus) nested under each dataset —
  // same idea one level deeper, so it persists across both view and dataset.
  const [variantIdx, setVariantIdx] = useState(0)
  // Fourth, independent toggle axis (e.g. Linear/Log) nested under each variant —
  // same data, different axis scale, so it's resolved into scale props, not
  // categories/series.
  const [scaleIdx, setScaleIdx] = useState(0)

  // Mobile: the whole viewBox scales down to phone width, so we shrink the
  // coordinate space (fonts render near nominal) and default to a "Focus" view
  // — the dense "All" set is unreadable at this size.
  const [mobile, setMobile] = useState(false)
  const userPicked = useRef(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const apply = () => setMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  const focusIdx = views ? views.findIndex((v) => /focus/i.test(v.label)) : -1
  useEffect(() => {
    if (userPicked.current) return
    setViewIdx(mobile && focusIdx >= 0 ? focusIdx : defaultViewIdx)
  }, [mobile, focusIdx, defaultViewIdx])

  // Resolve the active dataset (a view, or the flat props as a single view).
  const activeView =
    views && views.length ? views[Math.min(viewIdx, views.length - 1)] : { categories, series }
  const activeDatasets = activeView.datasets
  const activeDataset =
    activeDatasets && activeDatasets.length
      ? activeDatasets[Math.min(datasetIdx, activeDatasets.length - 1)]
      : null
  const activeVariants = activeDataset?.variants
  // Same mobile-Focus-default idea as the view-level one above, but for
  // charts where All/Focus is a nested variant instead of a top-level view
  // (e.g. the write/read latency charts, where the top-level views are
  // Human/Agent).
  const variantFocusIdx = activeVariants
    ? activeVariants.findIndex((v) => /focus/i.test(v.label))
    : -1
  useEffect(() => {
    if (userPicked.current) return
    setVariantIdx(mobile && variantFocusIdx >= 0 ? variantFocusIdx : 0)
  }, [mobile, variantFocusIdx])
  const activeVariant =
    activeVariants && activeVariants.length
      ? activeVariants[Math.min(variantIdx, activeVariants.length - 1)]
      : null
  const resolved = activeVariant || activeDataset || activeView
  const activeScales = activeVariant?.scales
  const activeScale =
    activeScales && activeScales.length
      ? activeScales[Math.min(scaleIdx, activeScales.length - 1)]
      : null
  const cats = resolved.categories || []
  const srs = resolved.series || []
  const horizontal = orientation === 'horizontal'
  const N = cats.length

  const legendOn = showLegend != null ? showLegend : srs.length > 1

  // ── Tooltip: fixed, cursor-following div (imperative, no re-render). ────────
  const moveTip = (e) => {
    const t = tipRef.current
    if (!t) return
    t.style.left = Math.min(e.clientX + 14, window.innerWidth - 300) + 'px'
    t.style.top = Math.min(e.clientY + 14, window.innerHeight - 160) + 'px'
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

  const colorOf = (s, ci) => (s.colors ? s.colors[ci] : s.color) || C.accent
  const opacityOf = (s, ci) => {
    const o = s.opacities ? s.opacities[ci] : s.opacity
    return o == null ? 1 : o
  }

  // ── Grouping model ──────────────────────────────────────────────────────────
  // stacked  → groups = distinct series.group (fallback single stack);
  //            within a group, series stack in array order.
  // grouped  → each series is its own group (side-by-side bars).
  let groupKeys = []
  const groupOf = (s, si) => (stacked ? s.group || '_' : s.name || String(si))
  srs.forEach((s, si) => {
    const k = groupOf(s, si)
    if (!groupKeys.includes(k)) groupKeys.push(k)
  })
  const G = Math.max(1, groupKeys.length)

  // Value-axis maximum = tallest stack across every category × group.
  let dataMax = 0
  for (let ci = 0; ci < N; ci++) {
    for (const gk of groupKeys) {
      let sum = 0
      srs.forEach((s, si) => {
        if (groupOf(s, si) === gk) sum += Math.max(0, s.values?.[ci] || 0)
      })
      if (sum > dataMax) dataMax = sum
    }
  }
  // Per-scale-toggle overrides fall back to the top-level props, same
  // resolution order as categories/series above.
  const rValueScale = activeScale?.valueScale ?? valueScale
  const rValueMin = activeScale && 'valueMin' in activeScale ? activeScale.valueMin : valueMin
  const rValueMax = activeScale && 'valueMax' in activeScale ? activeScale.valueMax : valueMax
  const rValueTicks = activeScale?.valueTicks ?? valueTicks
  const rValueLabel = activeScale?.valueLabel ?? valueLabel
  const isLog = rValueScale === 'log'
  // Smallest positive datum — the log floor falls back to this when unspecified.
  let dataMin = Infinity
  for (let ci = 0; ci < N; ci++) {
    srs.forEach((s) => {
      const v = s.values?.[ci]
      if (v != null && v > 0 && v < dataMin) dataMin = v
    })
  }
  if (!isFinite(dataMin)) dataMin = 1

  // Value-axis ticks: numbers or [value, label] pairs → {v, label}.
  const rawTicks = rValueTicks || niceLinearTicks(0, (dataMax || 1) * 1.12, 5)
  const vt = rawTicks.map((t) =>
    Array.isArray(t) ? { v: t[0], label: t[1] } : { v: t, label: trim(t) }
  )
  const tickVals = vt.map((t) => t.v)

  // Linear keeps its original max (unchanged for existing usages); log spans the
  // provided floor→ceiling, defaulting from the ticks/data.
  const vMax = isLog
    ? rValueMax != null
      ? rValueMax
      : Math.max(dataMax || 1, ...tickVals)
    : rValueMax != null
    ? rValueMax
    : (dataMax || 1) * 1.12
  const vMin = isLog
    ? rValueMin != null
      ? rValueMin
      : Math.min(dataMin, ...tickVals.filter((v) => v > 0))
    : 0

  // ── Geometry ────────────────────────────────────────────────────────────────
  // Shrinking W on mobile brings the scale factor (containerWidth / W) close to
  // 1, so the fixed-px SVG text renders at a legible size instead of ~half.
  const W = mobile ? 404 : VIEW_W
  // On mobile, title/subtitle render as wrapping HTML above the SVG (they can't
  // wrap inside the fixed viewBox), so don't reserve in-SVG space for them.
  const hasToggleRow = (views && views.length > 1) || (activeDatasets && activeDatasets.length > 1)
  const hasVariantRow = activeVariants && activeVariants.length > 1
  const hasScaleRow = activeScales && activeScales.length > 1
  const topPad =
    (title && !mobile ? 24 : 8) +
    (subtitle && !mobile ? 16 : 0) +
    (hasToggleRow ? 30 : 0) +
    (hasVariantRow ? 26 : 0) +
    (hasScaleRow ? 26 : 0)
  const catLabelFont = mobile ? 12 : 10.5
  // Font sizes, scaled up a touch on mobile.
  const fTick = mobile ? 13 : 10
  const fBarTxt = mobile ? 12 : 10
  const fBarTxtSm = mobile ? 11.5 : 9.5
  const fTitle = mobile ? 15 : 14
  const fSub = mobile ? 11 : 10.5
  const fAxisTitle = mobile ? 12.5 : 11.5

  let m, H
  if (horizontal) {
    const rowH = mobile ? 34 : 30
    H = height || topPad + N * rowH + 44
    // Size the label gutter to the LONGEST category label (monospace) instead of
    // a fixed width — short labels ("heart") no longer leave a big empty column.
    const maxLabelChars = cats.reduce((mx, c) => Math.max(mx, String(c).length), 1)
    const labelW = maxLabelChars * catLabelFont * 0.62
    const leftFloor = mobile ? 40 : 56
    const leftCap = mobile ? 160 : 220
    // +26 keeps the label→bar gap and leaves `truncate` (m.l-16) enough room to
    // avoid clipping a full-width label by a rounding pixel.
    const leftM = Math.min(leftCap, Math.max(leftFloor, Math.round(labelW + 26)))
    m = mobile ? { t: topPad, r: 48, b: 42, l: leftM } : { t: topPad, r: 74, b: 44, l: leftM }
  } else {
    H = height || (mobile ? 360 : 420)
    // extra bottom room for angled category labels
    m = mobile ? { t: topPad, r: 14, b: 86, l: 42 } : { t: topPad, r: 18, b: 96, l: 58 }
  }
  const pw = W - m.l - m.r
  const ph = H - m.t - m.b

  // Category axis runs along one edge; value axis along the other.
  // catStart..catEnd = pixel extent of the category axis.
  // valPx(v): 0 → valZero, vMax → valFull.
  const catStart = horizontal ? m.t : m.l
  const catEnd = horizontal ? m.t + ph : m.l + pw
  const valZero = horizontal ? m.l : m.t + ph
  const valFull = horizontal ? m.l + pw : m.t
  // Linear: 0 → valZero, vMax → valFull. Log: values ≤ vMin (incl. the bar base
  // at cum 0) map to valZero; vMax → valFull; intermediate on a log ramp.
  const logMin = isLog ? Math.log10(vMin) : 0
  const logMax = isLog ? Math.log10(vMax) : 0
  const valPx = (v) => {
    if (isLog) {
      const lv = v <= vMin ? logMin : Math.log10(v)
      return valZero + ((lv - logMin) / (logMax - logMin)) * (valFull - valZero)
    }
    return valZero + (v / vMax) * (valFull - valZero)
  }

  const band = N ? (catEnd - catStart) / N : 0
  const inner = band * (1 - barGap)
  const groupThick = inner / G
  const catCenter = (ci) => catStart + band * (ci + 0.5)
  const groupOffset = (gi) => -inner / 2 + groupThick * (gi + 0.5)

  // ── Build layers ──────────────────────────────────────────────────────────
  const gridLayer = []
  vt.forEach((t, i) => {
    if (t.v > vMax * 1.001 || (isLog && t.v < vMin * 0.999)) return
    const p = valPx(t.v)
    if (horizontal) {
      gridLayer.push(<line key={`vg${i}`} x1={p} y1={m.t} x2={p} y2={m.t + ph} stroke={C.grid} />)
      gridLayer.push(
        <text
          key={`vl${i}`}
          x={p}
          y={m.t + ph + 15}
          textAnchor="middle"
          fontSize={fTick}
          fill={C.muted}
          fontFamily="var(--font-mono, ui-monospace, monospace)"
        >
          {t.label}
        </text>
      )
    } else {
      gridLayer.push(<line key={`vg${i}`} x1={m.l} y1={p} x2={m.l + pw} y2={p} stroke={C.grid} />)
      gridLayer.push(
        <text
          key={`vl${i}`}
          x={m.l - 7}
          y={p + 3.5}
          textAnchor="end"
          fontSize={fTick}
          fill={C.muted}
          fontFamily="var(--font-mono, ui-monospace, monospace)"
        >
          {t.label}
        </text>
      )
    }
  })

  // Category labels + active-band highlight.
  const catLayer = []
  for (let ci = 0; ci < N; ci++) {
    const cc = catCenter(ci)
    const raw = String(cats[ci])
    if (horizontal) {
      catLayer.push(
        <text
          key={`cl${ci}`}
          x={m.l - 8}
          y={cc + 3.5}
          textAnchor="end"
          fontSize={catLabelFont}
          fill={activeCat === ci ? C.ink : C.muted}
          fontFamily="var(--font-mono, ui-monospace, monospace)"
          style={{ transition: 'fill 0.15s ease' }}
        >
          {truncate(raw, m.l - 16, catLabelFont)}
        </text>
      )
    } else {
      catLayer.push(
        <text
          key={`cl${ci}`}
          x={cc}
          y={m.t + ph + 12}
          textAnchor="end"
          fontSize={catLabelFont}
          fill={activeCat === ci ? C.ink : C.muted}
          fontFamily="var(--font-mono, ui-monospace, monospace)"
          transform={`rotate(-35 ${cc} ${m.t + ph + 12})`}
          style={{ transition: 'fill 0.15s ease' }}
        >
          {truncate(raw, 150, catLabelFont)}
        </text>
      )
    }
  }

  // Bars: iterate category × group, stacking series within a group.
  const barLayer = []
  const textLayer = []
  for (let ci = 0; ci < N; ci++) {
    groupKeys.forEach((gk, gi) => {
      const off = groupOffset(gi)
      const barC = catCenter(ci) + off
      let cum = 0
      srs.forEach((s, si) => {
        if (groupOf(s, si) !== gk) return
        const v = Math.max(0, s.values?.[ci] || 0)
        if (v <= 0) return
        const rawEnd = cum + v
        // A value that overshoots the configured axis max gets its bar
        // clamped to the ceiling instead of drawn (or overflowing) past it —
        // paired with a torn top edge + an overflow label showing the real
        // number, so an outlier reads as "there's more, off-chart" rather
        // than silently vanishing or breaking the plot's bounds.
        const clipped = !isLog && rawEnd > vMax
        const drawEnd = clipped ? vMax : rawEnd
        const p0 = valPx(cum)
        const p1 = valPx(drawEnd)
        cum = rawEnd
        const c = colorOf(s, ci)
        const op = opacityOf(s, ci)
        // Hover shows the tooltip only — bars keep their exact colour/opacity.
        const dim = false
        // The one bar the cursor is actually closest to (within the hovered
        // category only) gets a bright outline — same "highlight, don't
        // reorder" idea as the tooltip and LineChart's crosshair.
        const isNear = ci === activeCat && nearestKey != null && gk === nearestKey
        let rect
        if (horizontal) {
          rect = {
            x: Math.min(p0, p1),
            y: barC - groupThick / 2,
            width: Math.abs(p1 - p0),
            height: groupThick * 0.92,
          }
        } else {
          rect = {
            x: barC - groupThick / 2,
            y: Math.min(p0, p1),
            width: groupThick * 0.92,
            height: Math.abs(p1 - p0),
          }
        }
        if (!clipped) {
          barLayer.push(
            <rect
              key={`b${ci}-${si}`}
              {...rect}
              rx={1.5}
              fill={c}
              opacity={op}
              stroke={isNear ? C.ink : 'none'}
              strokeWidth={isNear ? 2 : 0}
              pointerEvents="none"
            />
          )
        } else {
          // The bar's own fill follows a jagged edge at the clamp line —
          // not a flat rect with a decorative line drawn over it, which left
          // the true flat top still solid and visible above the "tear."
          const teeth = 5
          const amp = 3.5
          const zig = []
          let base1, base2
          if (horizontal) {
            const edgeX = Math.max(p0, p1)
            const baseX = Math.min(p0, p1)
            // Bottom-to-top, so it connects cleanly from base1 (bottom-left)
            // without crossing the shape.
            const y0 = rect.y + rect.height
            const step = -rect.height / teeth
            for (let k = 0; k <= teeth; k++) {
              const y = y0 + k * step
              zig.push(`${edgeX + (k % 2 === 0 ? -amp : amp)},${y}`)
            }
            base1 = `${baseX},${rect.y + rect.height}`
            base2 = `${baseX},${rect.y}`
          } else {
            const edgeY = Math.min(p0, p1)
            const baseY = Math.max(p0, p1)
            const x0 = rect.x
            const step = rect.width / teeth
            for (let k = 0; k <= teeth; k++) {
              const x = x0 + k * step
              zig.push(`${x},${edgeY + (k % 2 === 0 ? -amp : amp)}`)
            }
            base1 = `${rect.x},${baseY}`
            base2 = `${rect.x + rect.width},${baseY}`
          }
          barLayer.push(
            <polygon
              key={`b${ci}-${si}`}
              points={`${base1} ${zig.join(' ')} ${base2}`}
              fill={c}
              opacity={op}
              stroke={isNear ? C.ink : 'none'}
              strokeWidth={isNear ? 2 : 0}
              pointerEvents="none"
            />
          )
          // Same plain style/position as a normal in-bar label (centered,
          // regular weight) — the torn edge already signals "this is capped,"
          // no need for the label itself to shout too.
          // Skipped on mobile: dense bars mean these labels collide with each
          // other, tapping a bar already reveals the value via the tooltip.
          const trueLabel = (s.text && s.text[ci]) || trim(v) + valueUnit
          if (!mobile) {
            textLayer.push(
              <text
                key={`ov${ci}-${si}`}
                x={horizontal ? (rect.x + rect.x + rect.width) / 2 : barC}
                y={horizontal ? barC + 3.4 : (p0 + p1) / 2 + 3.2}
                textAnchor="middle"
                fontSize={fBarTxtSm}
                fill={readableInk(blend(c, op, C.card))}
                fontFamily="var(--font-mono, ui-monospace, monospace)"
              >
                {trueLabel}
              </text>
            )
          }
        }

        // per-bar text label (skipped when clipped — the overflow label above
        // covers it; skipped on mobile — collides at that width, tap reveals
        // the value via the tooltip instead).
        const txt = s.text ? s.text[ci] : null
        const pos = s.textPosition || (horizontal ? 'outside' : 'inside')
        if (txt && pos !== 'none' && !dim && !clipped && !mobile) {
          if (horizontal && pos === 'outside') {
            textLayer.push(
              <text
                key={`t${ci}-${si}`}
                x={Math.max(p0, p1) + 5}
                y={barC + 3.4}
                textAnchor="start"
                fontSize={fBarTxt}
                fill={C.ink}
                fontFamily="var(--font-mono, ui-monospace, monospace)"
                pointerEvents="none"
              >
                {txt}
              </text>
            )
          } else if (!horizontal && pos === 'inside') {
            // only when the segment is tall enough to hold the label
            if (Math.abs(p1 - p0) >= 13) {
              textLayer.push(
                <text
                  key={`t${ci}-${si}`}
                  x={barC}
                  y={(p0 + p1) / 2 + 3.2}
                  textAnchor="middle"
                  fontSize={fBarTxtSm}
                  fill={readableInk(blend(c, op, C.card))}
                  fontFamily="var(--font-mono, ui-monospace, monospace)"
                  pointerEvents="none"
                >
                  {txt}
                </text>
              )
            }
          } else if (horizontal && pos === 'inside') {
            if (Math.abs(p1 - p0) >= 24) {
              textLayer.push(
                <text
                  key={`t${ci}-${si}`}
                  x={(p0 + p1) / 2}
                  y={barC + 3.4}
                  textAnchor="middle"
                  fontSize={fBarTxtSm}
                  fill={readableInk(blend(c, op, C.card))}
                  fontFamily="var(--font-mono, ui-monospace, monospace)"
                  pointerEvents="none"
                >
                  {txt}
                </text>
              )
            }
          } else if (!horizontal && pos === 'outside') {
            textLayer.push(
              <text
                key={`t${ci}-${si}`}
                x={barC}
                y={Math.min(p0, p1) - 4}
                textAnchor="middle"
                fontSize={fBarTxtSm}
                fill={C.ink}
                fontFamily="var(--font-mono, ui-monospace, monospace)"
                pointerEvents="none"
              >
                {txt}
              </text>
            )
          }
        }
      })
    })
  }

  // Tooltip readout: all series with a value at the hovered category (LineChart's
  // multi-series crosshair readout, adapted to bars). `nearestKey` (which
  // grouped bar the cursor is actually closest to, for non-stacked charts —
  // see hoverLayer below) gets bolded and highlighted IN PLACE; row order
  // never changes, only emphasis, so a chart with many grouped bars doesn't
  // require guessing which one you're pointing at.
  const buildTip = (ci, nearestKey) => {
    const rows = srs
      .map((s, si) => {
        const v = s.values?.[ci]
        if (v == null || v <= 0) return ''
        const c = colorOf(s, ci)
        const label = s.text && s.text[ci] ? s.text[ci] : trim(v) + valueUnit
        const isNear = nearestKey != null && groupOf(s, si) === nearestKey
        const parts = s.breakdown?.[ci]
        const breakdownHtml =
          parts && parts.length
            ? parts
                .map(
                  (p) =>
                    `<div style="display:flex;justify-content:space-between;gap:10px;` +
                    `margin:1px 0 0 15px;font-size:0.88em;color:rgba(255,255,255,0.55)">` +
                    `<span>${esc(p.label)}</span><span>${esc(
                      typeof p.value === 'number' ? trim(p.value) + valueUnit : p.value
                    )}</span></div>`
                )
                .join('')
            : ''
        // A bar this far past the rest gets capped at the axis limit and
        // drawn with a torn edge — explain why, right where the reader's
        // looking, instead of leaving the truncation unexplained.
        const isOutOfRange = !isLog && v > vMax
        const capNoteHtml = isOutOfRange
          ? `<div style="margin:3px 0 0 15px;font-size:0.82em;line-height:1.3;` +
            `color:rgba(255,255,255,0.5);font-style:italic;max-width:220px">` +
            `Outlier, bar clipped to keep the rest readable.</div>`
          : ''
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
          `color:${isNear ? '#fff' : 'rgba(255,255,255,0.75)'}">${esc(s.name || '')}</span>` +
          `<b style="color:#fff;margin-left:10px;font-size:${isNear ? '1.05em' : '1em'}">` +
          `${esc(label)}</b></div>` +
          breakdownHtml +
          capNoteHtml
        )
      })
      .filter(Boolean)
      .join('')
    if (!rows) return ''
    return (
      `<div style="font-weight:600;color:#fff;padding-bottom:5px;margin-bottom:3px;` +
      `border-bottom:1px solid rgba(255,255,255,0.14)">${esc(cats[ci])}</div>` +
      rows
    )
  }

  // Invisible hover zones — one per category band spanning the full plot.
  const hoverLayer = []
  for (let ci = 0; ci < N; ci++) {
    const cc = catCenter(ci)
    const zone = horizontal
      ? { x: m.l, y: cc - band / 2, width: pw, height: band }
      : { x: cc - band / 2, y: m.t, width: band, height: ph }
    const onMove = (e) => {
      if (activeCat !== ci) setActiveCat(ci)
      // Which grouped bar the cursor is actually over, by pixel position
      // along the group axis — only meaningful for grouped (non-stacked)
      // charts, where each series is its own side-by-side bar.
      let nearKey = null
      if (!stacked && G > 1) {
        const svg = e.currentTarget.ownerSVGElement
        const rect = svg && svg.getBoundingClientRect()
        if (rect && rect.width && rect.height) {
          const localPos = horizontal
            ? ((e.clientY - rect.top) / rect.height) * H
            : ((e.clientX - rect.left) / rect.width) * W
          let bd = Infinity
          groupKeys.forEach((gk, gi) => {
            const gc = cc + groupOffset(gi)
            const d = Math.abs(gc - localPos)
            if (d < bd) {
              bd = d
              nearKey = gk
            }
          })
        }
      }
      setNearestKey(nearKey)
      const html = buildTip(ci, nearKey)
      if (html) showTip(e, html)
    }
    hoverLayer.push(
      <rect
        key={`hz${ci}`}
        {...zone}
        fill="transparent"
        style={{ cursor: 'pointer' }}
        onPointerMove={onMove}
        onPointerEnter={onMove}
        onPointerLeave={() => {
          setActiveCat(null)
          setNearestKey(null)
          hideTip()
        }}
      />
    )
  }

  const legendSwatch = (s, si) => {
    const c = s.colors ? s.colors[0] : s.color || C.accent
    return (
      <span
        style={{
          display: 'inline-block',
          width: '11px',
          height: '11px',
          borderRadius: '2px',
          background: c,
          flex: 'none',
        }}
      />
    )
  }

  return (
    <div className="bar-chart" style={{ margin: '1.5rem 0' }}>
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 0,
          padding: '10px 10px 4px',
          background: C.card,
        }}
      >
        {/* Mobile: wrapping HTML title/subtitle (SVG text can't wrap in-viewBox) */}
        {mobile && (title || subtitle) && (
          <div
            style={{
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              padding: '2px 2px 4px',
            }}
          >
            {title && (
              <div style={{ fontSize: '13px', fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>
                {title}
              </div>
            )}
            {subtitle && (
              <div style={{ fontSize: '11px', color: C.muted, lineHeight: 1.35, marginTop: '2px' }}>
                {subtitle}
              </div>
            )}
          </div>
        )}

        {/* On-theme segmented toggle(s) (replaces Plotly updatemenus). Two
            independent rows when a `datasets` axis is present: dataset
            (secondary, left) and view (primary, right) — selection on one
            persists when the other changes, same pattern as LineChart. */}
        {hasToggleRow && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
              padding: '2px 2px 0',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          >
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
                        setActiveCat(null)
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
                        setActiveCat(null)
                        hideTip()
                      }}
                      style={{
                        appearance: 'none',
                        cursor: 'pointer',
                        fontSize: '11px',
                        lineHeight: 1,
                        padding: '5px 11px',
                        border: `1px solid ${on ? C.accent : C.border}`,
                        marginLeft: i === 0 ? 0 : '-1px',
                        background: on ? C.accent : 'transparent',
                        color: on ? C.accentInk : C.muted,
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

        {/* Third toggle row (e.g. All/Focus) — nested under the active dataset,
            independent of both the dataset and view toggles above. Centered and
            small, since it's a refinement of the current dataset, not a peer axis. */}
        {hasVariantRow && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '4px 2px 0',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          >
            {activeVariants.map((vr, i) => {
              const on = i === Math.min(variantIdx, activeVariants.length - 1)
              return (
                <button
                  key={vr.label}
                  type="button"
                  onClick={() => {
                    setVariantIdx(i)
                    setActiveCat(null)
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
                  {vr.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Fourth toggle row (e.g. Linear/Log) — same data, different axis
            scale, so it only ever resolves into scale props, never categories. */}
        {hasScaleRow && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '4px 2px 0',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          >
            {activeScales.map((sc, i) => {
              const on = i === Math.min(scaleIdx, activeScales.length - 1)
              return (
                <button
                  key={sc.label}
                  type="button"
                  onClick={() => {
                    setScaleIdx(i)
                    setActiveCat(null)
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
                  {sc.label}
                </button>
              )
            })}
          </div>
        )}

        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={title || 'bar chart'}
          style={{ display: 'block', width: '100%', height: 'auto' }}
        >
          {title && !mobile && (
            <text
              x={W / 2}
              y={subtitle ? 15 : 18}
              textAnchor="middle"
              fontSize={fTitle}
              fontWeight="600"
              fill={C.ink}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
            >
              {title}
            </text>
          )}
          {subtitle && !mobile && (
            <text
              x={W / 2}
              y={30}
              textAnchor="middle"
              fontSize={fSub}
              fill={C.muted}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
            >
              {subtitle}
            </text>
          )}
          {gridLayer}
          {catLayer}
          {/* plot frame + value/category baseline axes */}
          <rect x={m.l} y={m.t} width={pw} height={ph} fill="none" stroke={C.grid} />
          <line x1={m.l} y1={m.t} x2={m.l} y2={m.t + ph} stroke={C.axis} />
          <line x1={m.l} y1={m.t + ph} x2={m.l + pw} y2={m.t + ph} stroke={C.axis} />
          {barLayer}
          {textLayer}
          {hoverLayer}
          {rValueLabel && horizontal && (
            <text
              x={m.l + pw / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize={fAxisTitle}
              fill={C.ink}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
            >
              {rValueLabel}
            </text>
          )}
          {rValueLabel && !horizontal && (
            <text
              transform={`translate(13 ${m.t + ph / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize={fAxisTitle}
              fill={C.ink}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
            >
              {rValueLabel}
            </text>
          )}
        </svg>

        {legendOn && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px 18px',
              justifyContent: 'center',
              padding: '6px 6px 8px',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: '12px',
              color: C.ink,
            }}
          >
            {srs.map((s, si) => (
              <span
                key={s.name || si}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}
              >
                {legendSwatch(s, si)}
                {s.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* cursor-following tooltip (same visual language as LineChart) */}
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

// Match PlotlyChart/LineChart: render client-side only (theme + tooltip need
// the DOM), avoiding SSR/hydration mismatches when embedded in MDX.
const BarChart = dynamic(() => Promise.resolve(ChartImpl), { ssr: false })

export default BarChart

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
 *   valueMax     number    optional value-axis max (else auto from data + pad)
 *   valueTicks   Array     explicit value-axis ticks (numbers). Else auto.
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
  const [viewIdx, setViewIdx] = useState(0)

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
    setViewIdx(mobile && focusIdx >= 0 ? focusIdx : 0)
  }, [mobile, focusIdx])

  // Resolve the active dataset (a view, or the flat props as a single view).
  const resolved =
    views && views.length ? views[Math.min(viewIdx, views.length - 1)] : { categories, series }
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
  const vMax = valueMax != null ? valueMax : (dataMax || 1) * 1.12
  const vt = valueTicks || niceLinearTicks(0, vMax, 5)

  // ── Geometry ────────────────────────────────────────────────────────────────
  // Shrinking W on mobile brings the scale factor (containerWidth / W) close to
  // 1, so the fixed-px SVG text renders at a legible size instead of ~half.
  const W = mobile ? 404 : VIEW_W
  // On mobile, title/subtitle render as wrapping HTML above the SVG (they can't
  // wrap inside the fixed viewBox), so don't reserve in-SVG space for them.
  const topPad = (title && !mobile ? 24 : 8) + (subtitle && !mobile ? 16 : 0) + (views ? 30 : 0)
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
    m = mobile ? { t: topPad, r: 48, b: 42, l: 148 } : { t: topPad, r: 74, b: 44, l: 208 }
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
  const valPx = (v) => valZero + (v / vMax) * (valFull - valZero)

  const band = N ? (catEnd - catStart) / N : 0
  const inner = band * (1 - barGap)
  const groupThick = inner / G
  const catCenter = (ci) => catStart + band * (ci + 0.5)
  const groupOffset = (gi) => -inner / 2 + groupThick * (gi + 0.5)

  // ── Build layers ──────────────────────────────────────────────────────────
  const gridLayer = []
  vt.forEach((v, i) => {
    if (v > vMax * 1.001) return
    const p = valPx(v)
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
          {trim(v)}
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
          {trim(v)}
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
          fontWeight={activeCat === ci ? 600 : 400}
          fill={activeCat === ci ? C.ink : C.muted}
          fontFamily="var(--font-mono, ui-monospace, monospace)"
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
          fontWeight={activeCat === ci ? 600 : 400}
          fill={activeCat === ci ? C.ink : C.muted}
          fontFamily="var(--font-mono, ui-monospace, monospace)"
          transform={`rotate(-35 ${cc} ${m.t + ph + 12})`}
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
        const p0 = valPx(cum)
        const p1 = valPx(cum + v)
        cum += v
        const c = colorOf(s, ci)
        const op = opacityOf(s, ci)
        // Hover shows the tooltip only — bars keep their exact colour/opacity.
        const dim = false
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
        barLayer.push(
          <rect
            key={`b${ci}-${si}`}
            {...rect}
            rx={1.5}
            fill={c}
            opacity={op}
            stroke="none"
            pointerEvents="none"
          />
        )

        // per-bar text label
        const txt = s.text ? s.text[ci] : null
        const pos = s.textPosition || (horizontal ? 'outside' : 'inside')
        if (txt && pos !== 'none' && !dim) {
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
                  fill={readableInk(c)}
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
                  fill={readableInk(c)}
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
  // multi-series crosshair readout, adapted to bars).
  const buildTip = (ci) => {
    const rows = srs
      .map((s, si) => {
        const v = s.values?.[ci]
        if (v == null || v <= 0) return ''
        const c = colorOf(s, ci)
        const label = s.text && s.text[ci] ? s.text[ci] : trim(v) + valueUnit
        return (
          `<div style="display:flex;align-items:center;gap:6px;margin-top:3px">` +
          `<span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${c};flex:none"></span>` +
          `<span style="flex:1 1 auto">${esc(s.name || '')}</span>` +
          `<b style="color:#fff;margin-left:10px">${esc(label)}</b></div>`
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
      const html = buildTip(ci)
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

        {/* On-theme segmented toggle (replaces Plotly updatemenus) */}
        {views && views.length > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0',
              padding: '2px 2px 0',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            }}
          >
            {views.map((v, i) => {
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
          {valueLabel && horizontal && (
            <text
              x={m.l + pw / 2}
              y={H - 6}
              textAnchor="middle"
              fontSize={fAxisTitle}
              fill={C.ink}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
            >
              {valueLabel}
            </text>
          )}
          {valueLabel && !horizontal && (
            <text
              transform={`translate(13 ${m.t + ph / 2}) rotate(-90)`}
              textAnchor="middle"
              fontSize={fAxisTitle}
              fill={C.ink}
              fontFamily="var(--font-mono, ui-monospace, monospace)"
            >
              {valueLabel}
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

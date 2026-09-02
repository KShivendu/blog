import dynamic from 'next/dynamic'
import { useState } from 'react'
import { useTheme } from 'next-themes'

/*
 * AreaSquares — magnitude-as-area chart for the blog.
 *
 * Each item is a SQUARE whose AREA is proportional to its value, so the visible
 * side is √value. That square-roots the dynamic range (a 48,000 value → 219px
 * side, a 1 value → 1px), letting a huge value and a tiny one share one honest
 * linear-area view without a log axis. Squares are sorted largest-first and
 * shelf-packed; a segmented toggle switches series. The scale is shared across
 * series, so a given value is the same size in every view.
 *
 * Prop API:
 *   title, subtitle   strings
 *   unit              value label suffix in tooltips/labels (default '')
 *   nDocs             optional corpus size → labels can show "value (pct%)"
 *   views             [{ label, color, tiles: [[label, value], ...] }]
 */

function palette(isDark) {
  return isDark
    ? {
        ink: '#dde6e0',
        muted: '#8a968e',
        border: '#1e2822',
        card: '#0d1310',
        btn: '#141a17',
      }
    : {
        ink: '#14161a',
        muted: '#5f6570',
        border: '#e0e4e1',
        card: '#ffffff',
        btn: '#f3f6f4',
      }
}

const VB_W = 700
const GAP = 3

// Shelf-pack sorted squares into width W; returns positioned squares + total height.
function pack(items, scale, W) {
  let x = 0
  let y = 0
  let rowH = 0
  const out = []
  for (const it of items) {
    const s = Math.max(2, Math.sqrt(it.value) * scale)
    if (x + s > W && x > 0) {
      x = 0
      y += rowH + GAP
      rowH = 0
    }
    out.push({ ...it, x, y, s })
    x += s + GAP
    rowH = Math.max(rowH, s)
  }
  return { squares: out, height: y + rowH }
}

function fmt(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n)
}

function TreemapImpl({ title, subtitle, unit = '', nDocs, maxSquare = 60, views = [] }) {
  const { theme, resolvedTheme } = useTheme()
  const isDark = (resolvedTheme || theme) === 'dark'
  const C = palette(isDark)
  const tileInk = isDark ? '#08110c' : '#0b1f16'
  const [idx, setIdx] = useState(0)
  const view = views[Math.min(idx, views.length - 1)] || { tiles: [] }

  // Shared scale: the largest value across all views maps to a target side.
  const globalMax = Math.max(1, ...views.flatMap((v) => v.tiles.map(([, val]) => val)))
  const scale = maxSquare / Math.sqrt(globalMax)

  const items = view.tiles
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
  const { squares, height } = pack(items, scale, VB_W)
  const VB_H = Math.ceil(height) + 2

  return (
    <div
      style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        background: C.card,
        padding: '12px 12px 14px',
        margin: '1.5rem 0',
      }}
    >
      {title && (
        <div
          style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 13,
            fontWeight: 600,
            color: C.ink,
            textAlign: 'center',
          }}
        >
          {title}
        </div>
      )}
      {subtitle && (
        <div
          style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 11,
            color: C.muted,
            textAlign: 'center',
            marginTop: 2,
          }}
        >
          {subtitle}
        </div>
      )}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 4,
          margin: '10px 0',
        }}
      >
        {views.map((v, i) => (
          <button
            key={i}
            onClick={() => setIdx(i)}
            style={{
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 11,
              padding: '3px 10px',
              borderRadius: 5,
              border: `1px solid ${i === idx ? v.color : C.border}`,
              background: i === idx ? v.color : C.btn,
              color: i === idx ? tileInk : C.muted,
              cursor: 'pointer',
              fontWeight: i === idx ? 600 : 400,
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        style={{ display: 'block', width: '100%', height: 'auto' }}
        role="img"
        aria-label={`${title || 'area squares'} — ${view.label || ''}`}
      >
        {squares.map((sq, i) => {
          const pct = nDocs ? Math.round((100 * sq.value) / nDocs) : null
          const showTerm = sq.s > 26
          const showVal = sq.s > 44
          return (
            <g key={i}>
              <rect
                x={sq.x}
                y={sq.y}
                width={sq.s}
                height={sq.s}
                fill={view.color}
                fillOpacity={0.9}
                stroke={C.card}
                strokeWidth={1}
              />
              {showTerm && (
                <text
                  x={sq.x + 4}
                  y={sq.y + 13}
                  fontSize={sq.s > 60 ? 12 : 10}
                  fill={tileInk}
                  fontFamily="var(--font-mono, ui-monospace, monospace)"
                  style={{ pointerEvents: 'none' }}
                >
                  {sq.label}
                </text>
              )}
              {showVal && (
                <text
                  x={sq.x + 4}
                  y={sq.y + sq.s - 6}
                  fontSize={10}
                  fill={tileInk}
                  fillOpacity={0.75}
                  fontFamily="var(--font-mono, ui-monospace, monospace)"
                  style={{ pointerEvents: 'none' }}
                >
                  {pct != null ? `${pct}%` : fmt(sq.value) + unit}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const AreaSquares = dynamic(() => Promise.resolve(TreemapImpl), { ssr: false })
export default AreaSquares

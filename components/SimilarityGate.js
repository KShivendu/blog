import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

// Similarity-gate scatter for the learned-pair section: every candidate pair
// sits at (PPMI cosine similarity, attestation weight). A vertical gate keeps
// the pairs to its right and drops the rest. Three presets mirror the blog's
// threshold sweep exactly:
//   0.25  junk slips in    (mean 0.5807, but the junk carries no weight)
//   0.30  the sweet spot   (mean 0.5807, junk excluded at no cost)
//   0.40  good pairs lost   (viral/virus at 0.37 is gone, mean falls to 0.5780)
// Green = kept good pair, orange = junk that slipped past the gate, grey =
// dropped. False friends carry no real weight, so they sit on the floor.
//
// Visual language matches the site charts / heroes: warm-grey Teletype palette,
// Fira Code mono, hairline axes, one brand-green accent.

const KEPT = [
  { pair: 'viral → virus', sim: 0.37, w: 0.72 },
  { pair: 'dietary → diet', sim: 0.55, w: 0.65 },
  { pair: 'high → higher', sim: 0.52, w: 0.59 },
  { pair: 'behavioral → behaviour', sim: 0.42, w: 0.49 },
  { pair: 'high → highest', sim: 0.48, w: 0.41 },
  { pair: 'early → earlier', sim: 0.46, w: 0.35 },
]
// false friends: both score 0.25, never earn a weight, shown low for placement
const JUNK = [
  { pair: 'cancer → canine', sim: 0.25, w: 0.07 },
  { pair: 'events → eve', sim: 0.25, w: 0.02 },
]
const GATES = [
  { g: 0.25, mean: '0.5807', tag: 'junk slips in' },
  { g: 0.3, mean: '0.5807', tag: 'the sweet spot' },
  { g: 0.4, mean: null, tag: 'good pairs lost' },
]

const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'

export default function SimilarityGate() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const [gi, setGi] = useState(1) // default 0.30

  const gate = GATES[gi].g
  const c = dark
    ? {
        card: '#0d1310',
        border: '#1e2822',
        ink: '#dde6e0',
        muted: '#8a968e',
        axis: '#38473e',
        grid: '#182019',
        accent: '#34d399',
        accentInk: '#08110c',
        keepZone: 'rgba(52,211,153,0.06)',
        dropZone: 'rgba(240,163,163,0.05)',
        churn: '#f0a3a3',
        drop: '#5c6862',
      }
    : {
        card: '#ffffff',
        border: '#e0e4e1',
        ink: '#14161a',
        muted: '#5f6570',
        axis: '#c8cfc9',
        grid: '#eef1ee',
        accent: '#047857',
        accentInk: '#ffffff',
        keepZone: 'rgba(4,120,87,0.05)',
        dropZone: 'rgba(194,65,15,0.05)',
        churn: '#c2410c',
        drop: '#9aa39c',
      }

  // plot geometry (SVG user units; scales responsively via viewBox)
  const W = 720
  const H = 380
  const L = 48
  const R = 150
  const T = 22
  const B = 46
  const xdom = [0.15, 0.6]
  const ydom = [0, 0.8]
  const px = (s) => L + ((s - xdom[0]) / (xdom[1] - xdom[0])) * (W - L - R)
  const py = (w) => T + (1 - (w - ydom[0]) / (ydom[1] - ydom[0])) * (H - T - B)

  const gx = px(gate)
  const all = [
    ...KEPT.map((p) => ({ ...p, junk: false })),
    ...JUNK.map((p) => ({ ...p, junk: true })),
  ]
  const keptCount = all.filter((p) => p.sim >= gate).length

  const xticks = [0.2, 0.3, 0.4, 0.5, 0.6]
  const yticks = [0, 0.2, 0.4, 0.6, 0.8]

  return (
    <div
      style={{
        background: c.card,
        border: `1px solid ${c.border}`,
        borderRadius: 2,
        padding: 'clamp(12px, 3vw, 16px)',
        margin: '1.5rem 0',
        color: c.ink,
        fontFamily: MONO,
      }}
    >
      {/* header: title + gate presets */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 4,
        }}
      >
        <span style={{ fontSize: 14, fontWeight: 700 }}>The 0.30 similarity gate</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: c.muted,
            }}
          >
            gate
          </span>
          <div style={{ display: 'flex' }}>
            {GATES.map((G, k) => {
              const on = k === gi
              return (
                <button
                  key={G.g}
                  type="button"
                  onClick={() => setGi(k)}
                  aria-pressed={on}
                  style={{
                    appearance: 'none',
                    cursor: 'pointer',
                    fontSize: 12,
                    lineHeight: 1,
                    padding: '6px 11px',
                    border: `1px solid ${on ? c.accent : c.border}`,
                    marginLeft: k === 0 ? 0 : '-1px',
                    background: on ? c.accent : 'transparent',
                    color: on ? c.accentInk : c.muted,
                    fontFamily: MONO,
                    fontWeight: on ? 700 : 400,
                    fontVariantNumeric: 'tabular-nums',
                    zIndex: on ? 1 : 0,
                    position: 'relative',
                    borderRadius: 2,
                    transition: 'background .15s, color .15s, border-color .15s',
                  }}
                >
                  {G.g.toFixed(2)}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: c.muted, marginBottom: 8 }}>
        Each pair sits at its co-occurrence similarity and its attestation weight. The gate keeps
        what's on its right.
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: 'block' }}>
        {/* kept / dropped zones */}
        <rect x={gx} y={T} width={W - R - gx} height={H - T - B} fill={c.keepZone} />
        <rect x={L} y={T} width={gx - L} height={H - T - B} fill={c.dropZone} />

        {/* grid + axes */}
        {yticks.map((t) => (
          <g key={`y${t}`}>
            <line x1={L} y1={py(t)} x2={W - R} y2={py(t)} stroke={c.grid} strokeWidth="1" />
            <text
              x={L - 8}
              y={py(t) + 3.5}
              textAnchor="end"
              fontSize="10.5"
              fill={c.muted}
              fontFamily={MONO}
            >
              {t.toFixed(1)}
            </text>
          </g>
        ))}
        {xticks.map((t) => (
          <text
            key={`x${t}`}
            x={px(t)}
            y={H - B + 16}
            textAnchor="middle"
            fontSize="10.5"
            fill={c.muted}
            fontFamily={MONO}
          >
            {t.toFixed(1)}
          </text>
        ))}
        <line x1={L} y1={H - B} x2={W - R} y2={H - B} stroke={c.axis} strokeWidth="1" />

        {/* axis titles */}
        <text
          x={(L + W - R) / 2}
          y={H - 4}
          textAnchor="middle"
          fontSize="11"
          fill={c.muted}
          fontFamily={MONO}
        >
          co-occurrence similarity (PPMI cosine)
        </text>
        <text
          x={14}
          y={(T + H - B) / 2}
          textAnchor="middle"
          fontSize="11"
          fill={c.muted}
          fontFamily={MONO}
          transform={`rotate(-90 14 ${(T + H - B) / 2})`}
        >
          attestation weight
        </text>

        {/* the gate */}
        <line
          x1={gx}
          y1={T - 2}
          x2={gx}
          y2={H - B}
          stroke={c.accent}
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
        <text
          x={gx}
          y={T - 6}
          textAnchor="middle"
          fontSize="11"
          fontWeight="700"
          fill={c.accent}
          fontFamily={MONO}
        >
          gate {gate.toFixed(2)}
        </text>

        {/* points */}
        {all.map((p) => {
          const kept = p.sim >= gate
          const color = !kept ? c.drop : p.junk ? c.churn : c.accent
          const x = px(p.sim)
          const y = py(p.w)
          const rightEdge = x > px(0.5)
          const anchor = rightEdge ? 'end' : 'start'
          const dx = rightEdge ? -9 : 9
          return (
            <g key={p.pair} opacity={kept ? 1 : 0.75}>
              {p.junk ? (
                <g stroke={color} strokeWidth="1.6">
                  <line x1={x - 4} y1={y - 4} x2={x + 4} y2={y + 4} />
                  <line x1={x - 4} y1={y + 4} x2={x + 4} y2={y - 4} />
                </g>
              ) : (
                <circle
                  cx={x}
                  cy={y}
                  r="5"
                  fill={kept ? color : 'none'}
                  stroke={color}
                  strokeWidth="1.6"
                />
              )}
              <text
                x={x + dx}
                y={y + 3.5}
                textAnchor={anchor}
                fontSize="11"
                fill={kept ? c.ink : c.muted}
                fontFamily={MONO}
                style={{ textDecoration: kept ? 'none' : 'line-through' }}
              >
                {p.pair}
              </text>
            </g>
          )
        })}
      </svg>

      {/* readout */}
      <div
        style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}
      >
        <span
          style={{
            padding: '4px 9px',
            borderRadius: 2,
            fontSize: 11.5,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: MONO,
            background: gi === 1 ? 'rgba(4,120,87,0.09)' : 'transparent',
            color: gi === 1 ? c.accent : c.muted,
            border: `1px solid ${gi === 1 ? c.accent : c.axis}`,
            whiteSpace: 'nowrap',
          }}
        >
          keeps {keptCount} of {all.length} · {GATES[gi].tag}
        </span>
        <span style={{ fontSize: 12.5, color: c.muted, fontFamily: MONO }}>
          {GATES[gi].mean
            ? `mean NDCG@10 ${GATES[gi].mean}`
            : 'viral → virus (0.37) drops with the junk, and the mean falls to 0.5807 → 0.5780'}
        </span>
      </div>
    </div>
  )
}

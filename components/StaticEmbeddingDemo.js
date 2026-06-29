import { useMemo, useState } from 'react'
import { useTheme } from 'next-themes'

// A small, fixed 2-D "embedding table". Real static tables are 256–1024-d;
// we use 2-D so the mean-pool is visible as an arrow on a plane. Each word maps
// to a deterministic vector — the point is the *operation*, not the values.
const TABLE = {
  the: [0.15, -0.1],
  cat: [0.9, 0.5],
  dog: [0.75, -0.6],
  chased: [-0.6, 0.7],
  bit: [-0.5, -0.75],
  mouse: [-0.85, 0.35],
  man: [0.2, 0.95],
  quickly: [-0.2, -0.95],
}

const SENTENCES = {
  'the cat chased the mouse': ['the', 'cat', 'chased', 'the', 'mouse'],
  'the dog bit the man': ['the', 'dog', 'bit', 'the', 'man'],
}

function meanVec(tokens) {
  const v = [0, 0]
  tokens.forEach((t) => {
    const e = TABLE[t] || [0, 0]
    v[0] += e[0]
    v[1] += e[1]
  })
  return [v[0] / tokens.length, v[1] / tokens.length]
}

function shuffle(arr, seed) {
  const a = [...arr]
  let s = seed
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function StaticEmbeddingDemo() {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  const [sentence, setSentence] = useState('the cat chased the mouse')
  const [seed, setSeed] = useState(1)

  const base = SENTENCES[sentence]
  const tokens = useMemo(() => (seed === 0 ? base : shuffle(base, seed)), [base, seed])
  const mean = useMemo(() => meanVec(tokens), [tokens])
  const baseMean = useMemo(() => meanVec(base), [base])
  const cosine = useMemo(() => {
    const dot = mean[0] * baseMean[0] + mean[1] * baseMean[1]
    const n1 = Math.hypot(...mean)
    const n2 = Math.hypot(...baseMean)
    return dot / (n1 * n2 + 1e-9)
  }, [mean, baseMean])

  // colors
  const bg = dark ? '#1e293b' : '#f8fafc'
  const grid = dark ? '#334155' : '#e2e8f0'
  const axis = dark ? '#64748b' : '#94a3b8'
  const tokenCol = dark ? '#64748b' : '#94a3b8'
  const textMain = dark ? '#e2e8f0' : '#1e293b'
  const textMuted = dark ? '#94a3b8' : '#64748b'
  const accent = '#10b981'
  const chipBg = dark ? '#0f172a' : '#ffffff'

  // plot geometry
  const S = 300
  const cx = S / 2
  const cy = S / 2
  const scale = 95 // units → px
  const toX = (x) => cx + x * scale
  const toY = (y) => cy - y * scale

  return (
    <div
      style={{
        margin: '1.75rem 0',
        background: bg,
        borderRadius: 12,
        padding: '1rem 1rem 1.25rem',
        fontFamily: 'Inter, sans-serif',
        maxWidth: 640,
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      {/* controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 10,
          alignItems: 'center',
        }}
      >
        <select
          value={sentence}
          onChange={(e) => {
            setSentence(e.target.value)
            setSeed(0)
          }}
          style={{
            background: chipBg,
            color: textMain,
            border: `1px solid ${grid}`,
            borderRadius: 6,
            padding: '5px 8px',
            fontSize: 13,
          }}
        >
          {Object.keys(SENTENCES).map((s) => (
            <option key={s} value={s}>
              “{s}”
            </option>
          ))}
        </select>
        <button
          onClick={() => setSeed((s) => s + 1)}
          style={{
            background: accent,
            color: 'white',
            border: 'none',
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          ↻ Shuffle word order
        </button>
        <button
          onClick={() => setSeed(0)}
          style={{
            background: 'transparent',
            color: textMuted,
            border: `1px solid ${grid}`,
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          reset
        </button>
      </div>

      {/* token chips in current order */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {tokens.map((t, i) => (
          <span
            key={i}
            style={{
              background: chipBg,
              color: textMain,
              border: `1px solid ${grid}`,
              borderRadius: 6,
              padding: '3px 9px',
              fontSize: 13,
              fontFamily: 'monospace',
            }}
          >
            {t}
          </span>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <svg viewBox={`0 0 ${S} ${S}`} style={{ width: 300, maxWidth: '100%' }}>
          <rect width={S} height={S} rx="8" fill={dark ? '#0f172a' : '#ffffff'} />
          {/* grid + axes */}
          <line x1={cx} y1="6" x2={cx} y2={S - 6} stroke={axis} strokeWidth="1" />
          <line x1="6" y1={cy} x2={S - 6} y2={cy} stroke={axis} strokeWidth="1" />
          {/* per-token vectors (faint) */}
          {tokens.map((t, i) => {
            const e = TABLE[t] || [0, 0]
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={toX(e[0])}
                y2={toY(e[1])}
                stroke={tokenCol}
                strokeWidth="1.5"
                opacity="0.55"
              />
            )
          })}
          {tokens.map((t, i) => {
            const e = TABLE[t] || [0, 0]
            return (
              <text
                key={'l' + i}
                x={toX(e[0])}
                y={toY(e[1]) - 4}
                fontSize="10"
                fill={textMuted}
                textAnchor="middle"
                fontFamily="monospace"
              >
                {t}
              </text>
            )
          })}
          {/* mean vector (bold, accent) */}
          <defs>
            <marker id="meanArrow" markerWidth="9" markerHeight="9" refX="6" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill={accent} />
            </marker>
          </defs>
          <line
            x1={cx}
            y1={cy}
            x2={toX(mean[0])}
            y2={toY(mean[1])}
            stroke={accent}
            strokeWidth="3"
            markerEnd="url(#meanArrow)"
          />
          <circle cx={toX(mean[0])} cy={toY(mean[1])} r="4" fill={accent} />
        </svg>

        <div style={{ flex: '1 1 220px', minWidth: 200 }}>
          <div style={{ fontSize: 13, color: textMuted, marginBottom: 4 }}>
            sentence vector = mean of token vectors
          </div>
          <div style={{ fontSize: 16, fontFamily: 'monospace', color: textMain, marginBottom: 12 }}>
            ({mean[0].toFixed(3)}, {mean[1].toFixed(3)})
          </div>
          <div style={{ fontSize: 13, color: textMuted, marginBottom: 4 }}>
            cosine vs original word order
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              fontFamily: 'monospace',
              color: cosine > 0.99999 ? accent : '#f59e0b',
            }}
          >
            {cosine.toFixed(5)}
          </div>
          <div style={{ fontSize: 12, color: textMuted, marginTop: 8, lineHeight: 1.5 }}>
            {cosine > 0.99999
              ? 'Shuffling reorders the arrows but the mean lands in the exact same place. Permutation-invariant.'
              : 'Same tokens, same mean.'}
          </div>
        </div>
      </div>
    </div>
  )
}

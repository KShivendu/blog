import { useTheme } from 'next-themes'

// Side-by-side encode paths: transformer (forward pass) vs static (table lookup + mean).
export default function StaticPipeline() {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'

  const bg = dark ? '#1e293b' : '#f8fafc'
  const divider = dark ? '#334155' : '#e2e8f0'
  const pill = dark ? '#0f172a' : '#ffffff'
  const pillStroke = dark ? '#475569' : '#cbd5e1'
  const textMain = dark ? '#e2e8f0' : '#1e293b'
  const textMuted = dark ? '#94a3b8' : '#64748b'
  const arrow = dark ? '#64748b' : '#94a3b8'

  const W = 660
  const H = 250
  const boxH = 30

  const Row = ({ y, label, color, stages, cost }) => {
    const x0 = 120
    const gap = 12
    const bw = (W - x0 - 150 - gap * (stages.length - 1)) / stages.length
    return (
      <>
        <text
          x="14"
          y={y - 16}
          fontSize="11"
          fontWeight="700"
          fill={textMuted}
          letterSpacing="0.05em"
        >
          {label}
        </text>
        {/* input pill */}
        <rect
          x="14"
          y={y}
          width="92"
          height={boxH}
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text x="60" y={y + 20} textAnchor="middle" fontSize="12" fill={textMain}>
          “heart attack”
        </text>
        {stages.map((s, i) => {
          const bx = x0 + i * (bw + gap)
          return (
            <g key={i}>
              <line
                x1={i === 0 ? 106 : bx - gap}
                y1={y + boxH / 2}
                x2={bx}
                y2={y + boxH / 2}
                stroke={arrow}
                strokeWidth="1.5"
                markerEnd="url(#spArrow)"
              />
              <rect x={bx} y={y} width={bw} height={boxH} rx="6" fill={s.fill || color} />
              <text
                x={bx + bw / 2}
                y={y + 19}
                textAnchor="middle"
                fontSize="11"
                fontWeight="600"
                fill={s.fill ? textMuted : 'white'}
              >
                {s.t}
              </text>
            </g>
          )
        })}
        {/* cost tag */}
        <text x={W - 14} y={y + 20} textAnchor="end" fontSize="13" fontWeight="700" fill={color}>
          {cost}
        </text>
      </>
    )
  }

  return (
    <div style={{ margin: '1.5rem 0' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: '100%',
          maxWidth: `${W}px`,
          display: 'block',
          margin: '0 auto',
          fontFamily: 'Inter, sans-serif',
          borderRadius: 10,
        }}
        aria-label="Transformer vs static embedding pipeline"
      >
        <defs>
          <marker id="spArrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={arrow} />
          </marker>
        </defs>
        <rect width={W} height={H} rx="10" fill={bg} />
        <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke={divider} strokeWidth="1" />

        <Row
          y={48}
          label="TRANSFORMER (all-MiniLM / BGE)"
          color="#6366f1"
          stages={[{ t: 'tokenize' }, { t: '6–12 attention layers' }, { t: 'mean-pool' }]}
          cost="~12–22 ms"
        />
        <Row
          y={172}
          label="STATIC (Model2Vec / EmbeddingBag)"
          color="#10b981"
          stages={[{ t: 'tokenize' }, { t: 'lookup table' }, { t: 'mean-pool' }]}
          cost="~0.1–0.4 ms"
        />

        <text x={W / 2} y={H - 6} textAnchor="middle" fontSize="10" fill={textMuted}>
          both end in a dense vector + cosine — only the middle differs: a forward pass vs O(tokens)
          lookups
        </text>
      </svg>
    </div>
  )
}

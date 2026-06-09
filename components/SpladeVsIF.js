import { useTheme } from 'next-themes'

export default function SpladeVsIF() {
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
  const H = 268
  const mid = 'ah'
  const midDash = 'ahd'

  const pillX = 14
  const pillW = 72
  const boxX = 154
  const boxW = 152
  const dotCX = 392
  const scoreX = 468
  const scoreW = 58

  // Row 1 y positions
  const r1qY = 44 // query pill top
  const r1dY = 78 // doc pill top
  const r1qCY = r1qY + 13 // 57
  const r1dCY = r1dY + 13 // 91
  const r1dotCY = Math.round((r1qCY + r1dCY) / 2) // 74 → use 73
  const r1DotCY = 73
  const r1ScoreY = r1DotCY - 13 // 60

  // Row 2 y positions
  const r2qY = 164
  const r2dY = 198
  const r2qCY = r2qY + 13 // 177
  const r2dCY = r2dY + 13 // 211
  const r2DotCY = Math.round((r2qCY + r2dCY) / 2) // 194 → use 195
  const r2ScoreY = r2DotCY - 13 // 182

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
          borderRadius: '10px',
        }}
        aria-label="SPLADE vs SPLADE-IF pipeline comparison"
      >
        <defs>
          <marker id={mid} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={arrow} />
          </marker>
          <marker id={midDash} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={pillStroke} />
          </marker>
        </defs>

        <rect width={W} height={H} rx="10" fill={bg} />
        <line x1="0" y1="134" x2={W} y2="134" stroke={divider} strokeWidth="1" />

        {/* Row labels */}
        <text x="14" y="16" fontSize="11" fontWeight="700" fill={textMuted} letterSpacing="0.06em">
          STANDARD SPLADE
        </text>
        <text x="14" y="150" fontSize="11" fontWeight="700" fill={textMuted} letterSpacing="0.06em">
          SPLADE-IF
        </text>

        {/* ── ROW 1 ── */}

        {/* query pill */}
        <rect
          x={pillX}
          y={r1qY}
          width={pillW}
          height="26"
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text x={pillX + pillW / 2} y={r1qCY + 4} textAnchor="middle" fontSize="12" fill={textMain}>
          query
        </text>

        {/* doc pill — dashed, pre-computed */}
        <rect
          x={pillX}
          y={r1dY}
          width={pillW}
          height="26"
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <text
          x={pillX + pillW / 2}
          y={r1dCY + 4}
          textAnchor="middle"
          fontSize="12"
          fill={textMuted}
        >
          doc
        </text>

        {/* SPLADE encoder box (query side) */}
        <rect x={boxX} y={r1qY} width={boxW} height="26" rx="6" fill="#6366f1" />
        <text
          x={boxX + boxW / 2}
          y={r1qCY + 4}
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill="white"
        >
          SPLADE Encoder · ~50ms
        </text>

        {/* pre-computed SPLADE vecs box (dashed) */}
        <rect
          x={boxX}
          y={r1dY}
          width={boxW}
          height="26"
          rx="6"
          fill={divider}
          stroke={pillStroke}
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <text x={boxX + boxW / 2} y={r1dCY + 4} textAnchor="middle" fontSize="11" fill={textMuted}>
          pre-computed SPLADE vecs
        </text>

        {/* query → encoder */}
        <line
          x1={pillX + pillW}
          y1={r1qCY}
          x2={boxX}
          y2={r1qCY}
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />
        {/* doc → pre-computed (dashed) */}
        <line
          x1={pillX + pillW}
          y1={r1dCY}
          x2={boxX}
          y2={r1dCY}
          stroke={pillStroke}
          strokeWidth="1.5"
          strokeDasharray="4 3"
          markerEnd={`url(#${midDash})`}
        />

        {/* encoder → dot */}
        <line
          x1={boxX + boxW}
          y1={r1qCY}
          x2={dotCX - 18}
          y2={r1DotCY - 6}
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />
        {/* pre-computed → dot (dashed) */}
        <line
          x1={boxX + boxW}
          y1={r1dCY}
          x2={dotCX - 18}
          y2={r1DotCY + 6}
          stroke={pillStroke}
          strokeWidth="1.5"
          strokeDasharray="4 3"
          markerEnd={`url(#${midDash})`}
        />

        {/* dot product */}
        <circle cx={dotCX} cy={r1DotCY} r="18" fill={pill} stroke="#6366f1" strokeWidth="2" />
        <text
          x={dotCX}
          y={r1DotCY + 6}
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill="#6366f1"
        >
          ·
        </text>

        {/* dot → score */}
        <line
          x1={dotCX + 18}
          y1={r1DotCY}
          x2={scoreX}
          y2={r1DotCY}
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        {/* score */}
        <rect
          x={scoreX}
          y={r1ScoreY}
          width={scoreW}
          height="26"
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text
          x={scoreX + scoreW / 2}
          y={r1DotCY + 4}
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fill={textMain}
        >
          score
        </text>

        {/* ── ROW 2 ── */}

        {/* query pill */}
        <rect
          x={pillX}
          y={r2qY}
          width={pillW}
          height="26"
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text x={pillX + pillW / 2} y={r2qCY + 4} textAnchor="middle" fontSize="12" fill={textMain}>
          query
        </text>

        {/* doc pill — dashed, pre-computed */}
        <rect
          x={pillX}
          y={r2dY}
          width={pillW}
          height="26"
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <text
          x={pillX + pillW / 2}
          y={r2dCY + 4}
          textAnchor="middle"
          fontSize="12"
          fill={textMuted}
        >
          doc
        </text>

        {/* Tokenizer box */}
        <rect x={boxX} y={r2qY} width={boxW} height="26" rx="6" fill="#10b981" />
        <text
          x={boxX + boxW / 2}
          y={r2qCY + 4}
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill="white"
        >
          Tokenizer · ~0.3ms
        </text>

        {/* pre-computed vecs box (dashed) */}
        <rect
          x={boxX}
          y={r2dY}
          width={boxW}
          height="26"
          rx="6"
          fill={divider}
          stroke={pillStroke}
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <text x={boxX + boxW / 2} y={r2dCY + 4} textAnchor="middle" fontSize="11" fill={textMuted}>
          pre-computed vecs
        </text>

        {/* query → tokenizer */}
        <line
          x1={pillX + pillW}
          y1={r2qCY}
          x2={boxX}
          y2={r2qCY}
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />
        {/* doc → pre-computed (dashed) */}
        <line
          x1={pillX + pillW}
          y1={r2dCY}
          x2={boxX}
          y2={r2dCY}
          stroke={pillStroke}
          strokeWidth="1.5"
          strokeDasharray="4 3"
          markerEnd={`url(#${midDash})`}
        />

        {/* tokenizer → dot */}
        <line
          x1={boxX + boxW}
          y1={r2qCY}
          x2={dotCX - 18}
          y2={r2DotCY - 6}
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />
        {/* pre-computed → dot (dashed) */}
        <line
          x1={boxX + boxW}
          y1={r2dCY}
          x2={dotCX - 18}
          y2={r2DotCY + 6}
          stroke={pillStroke}
          strokeWidth="1.5"
          strokeDasharray="4 3"
          markerEnd={`url(#${midDash})`}
        />

        {/* dot product */}
        <circle cx={dotCX} cy={r2DotCY} r="18" fill={pill} stroke="#10b981" strokeWidth="2" />
        <text
          x={dotCX}
          y={r2DotCY + 6}
          textAnchor="middle"
          fontSize="18"
          fontWeight="700"
          fill="#10b981"
        >
          ·
        </text>

        {/* dot → score */}
        <line
          x1={dotCX + 18}
          y1={r2DotCY}
          x2={scoreX}
          y2={r2DotCY}
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        {/* score */}
        <rect
          x={scoreX}
          y={r2ScoreY}
          width={scoreW}
          height="26"
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text
          x={scoreX + scoreW / 2}
          y={r2DotCY + 4}
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fill={textMain}
        >
          score
        </text>

        {/* footnote */}
        <text x="14" y="256" fontSize="10" fill={textMuted}>
          * doc vectors are pre-computed at index time for both variants; only query processing
          differs
        </text>
      </svg>
    </div>
  )
}

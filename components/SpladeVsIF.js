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
  const dotRing = dark ? '#334155' : '#e2e8f0'

  const W = 660
  const H = 268

  // arrowhead marker id (unique per render)
  const mid = 'ah'
  const midDash = 'ahd'

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

        {/* background */}
        <rect width={W} height={H} rx="10" fill={bg} />

        {/* divider */}
        <line x1="0" y1="134" x2={W} y2="134" stroke={divider} strokeWidth="1" />

        {/* ── Row labels ── */}
        <text
          x="14"
          y="16"
          fontSize="11"
          fontWeight="700"
          fill={textMuted}
          letterSpacing="0.06em"
          textDecoration="none"
        >
          STANDARD SPLADE
        </text>
        <text x="14" y="150" fontSize="11" fontWeight="700" fill={textMuted} letterSpacing="0.06em">
          SPLADE-IF
        </text>

        {/* ══════════════════════════════════
            ROW 1 — Standard SPLADE  (center y≈72)
        ══════════════════════════════════ */}

        {/* query pill */}
        <rect
          x="14"
          y="44"
          width="72"
          height="26"
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text x="50" y="61" textAnchor="middle" fontSize="12" fill={textMain}>
          query
        </text>

        {/* doc pill */}
        <rect
          x="14"
          y="78"
          width="72"
          height="26"
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text x="50" y="95" textAnchor="middle" fontSize="12" fill={textMain}>
          doc
        </text>

        {/* arrows → encoder */}
        <line
          x1="86"
          y1="57"
          x2="152"
          y2="68"
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />
        <line
          x1="86"
          y1="91"
          x2="152"
          y2="80"
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        {/* SPLADE encoder box */}
        <rect x="158" y="42" width="158" height="62" rx="8" fill="#6366f1" />
        <text x="237" y="68" textAnchor="middle" fontSize="13" fontWeight="700" fill="white">
          SPLADE Encoder
        </text>
        <text x="237" y="86" textAnchor="middle" fontSize="11" fill="rgba(255,255,255,0.75)">
          ~50ms · GPU
        </text>

        {/* arrow → dot */}
        <line
          x1="316"
          y1="73"
          x2="374"
          y2="73"
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        {/* dot product */}
        <circle cx="392" cy="73" r="18" fill={pill} stroke="#6366f1" strokeWidth="2" />
        <text x="392" y="79" textAnchor="middle" fontSize="18" fontWeight="700" fill="#6366f1">
          ·
        </text>

        {/* arrow → score */}
        <line
          x1="410"
          y1="73"
          x2="462"
          y2="73"
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        {/* score */}
        <rect
          x="468"
          y="60"
          width="58"
          height="26"
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text x="497" y="77" textAnchor="middle" fontSize="12" fontWeight="600" fill={textMain}>
          score
        </text>

        {/* ══════════════════════════════════
            ROW 2 — SPLADE-IF  (center y≈200)
        ══════════════════════════════════ */}

        {/* query pill */}
        <rect
          x="14"
          y="172"
          width="72"
          height="26"
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text x="50" y="189" textAnchor="middle" fontSize="12" fill={textMain}>
          query
        </text>

        {/* doc pill (grayed — pre-indexed) */}
        <rect
          x="14"
          y="208"
          width="72"
          height="26"
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <text x="50" y="224" textAnchor="middle" fontSize="12" fill={textMuted}>
          doc
        </text>

        {/* arrow query → tokenizer */}
        <line
          x1="86"
          y1="185"
          x2="152"
          y2="185"
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        {/* dashed arrow doc → stored vecs */}
        <line
          x1="86"
          y1="221"
          x2="152"
          y2="221"
          stroke={pillStroke}
          strokeWidth="1.5"
          strokeDasharray="4 3"
          markerEnd={`url(#${midDash})`}
        />

        {/* Tokenizer box */}
        <rect x="158" y="172" width="140" height="26" rx="6" fill="#10b981" />
        <text x="228" y="189" textAnchor="middle" fontSize="12" fontWeight="700" fill="white">
          Tokenizer · ~0.3ms
        </text>

        {/* Pre-computed vectors box */}
        <rect
          x="158"
          y="208"
          width="140"
          height="26"
          rx="6"
          fill={divider}
          stroke={pillStroke}
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <text x="228" y="225" textAnchor="middle" fontSize="11" fill={textMuted}>
          pre-computed vecs
        </text>

        {/* arrow tokenizer → dot */}
        <line
          x1="298"
          y1="185"
          x2="374"
          y2="198"
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        {/* dashed arrow pre-computed → dot */}
        <line
          x1="298"
          y1="221"
          x2="374"
          y2="208"
          stroke={pillStroke}
          strokeWidth="1.5"
          strokeDasharray="4 3"
          markerEnd={`url(#${midDash})`}
        />

        {/* dot product */}
        <circle cx="392" cy="201" r="18" fill={pill} stroke="#10b981" strokeWidth="2" />
        <text x="392" y="207" textAnchor="middle" fontSize="18" fontWeight="700" fill="#10b981">
          ·
        </text>

        {/* arrow → score */}
        <line
          x1="410"
          y1="201"
          x2="462"
          y2="201"
          stroke={arrow}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        {/* score */}
        <rect
          x="468"
          y="188"
          width="58"
          height="26"
          rx="6"
          fill={pill}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text x="497" y="205" textAnchor="middle" fontSize="12" fontWeight="600" fill={textMain}>
          score
        </text>

        {/* footnote */}
        <text x="14" y="256" fontSize="10" fill={textMuted}>
          * doc vectors pre-computed at index time; only tokenization runs at query time
        </text>
      </svg>
    </div>
  )
}

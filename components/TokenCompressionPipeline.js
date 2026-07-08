import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

// First 20 chars of the reference doc + ellipsis marker
const CHARS = 'Token-native storage'.split('').concat(['…'])

// Actual r50k tokenization of "Token-native storage persists documents as token IDs…"
// (verified with tiktoken.get_encoding('r50k_base'))
const TOKENS = [
  { t: 'Token' },
  { t: '-' },
  { t: 'native' },
  { t: ' storage' },
  { t: ' persists' },
  { t: ' documents' },
  { t: ' as' },
  { t: ' token' },
  { t: ' …' },
]

export default function TokenCompressionPipeline() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'

  const bg = dark ? '#1e293b' : '#f8fafc'
  const divider = dark ? '#334155' : '#e2e8f0'
  const textMain = dark ? '#e2e8f0' : '#1e293b'
  const textMuted = dark ? '#94a3b8' : '#64748b'
  const arrowC = dark ? '#64748b' : '#94a3b8'
  const pillBg = dark ? '#0f172a' : '#ffffff'
  const pillStroke = dark ? '#475569' : '#cbd5e1'
  const byteFill = dark ? 'rgba(71,85,105,0.3)' : '#f1f5f9'
  const byteStroke = dark ? '#475569' : '#cbd5e1'
  const byteText = dark ? '#94a3b8' : '#64748b'
  const tokFill = dark ? 'rgba(16,185,129,0.12)' : '#ecfdf5'
  const tokStroke = dark ? '#10b981' : '#059669'
  const tokText = dark ? '#6ee7b7' : '#065f46'

  const W = 640
  const H = 290
  const mid = 'tcp-arrow'

  const INP_X = 8,
    INP_W = 62,
    INP_H = 30
  const REP_X = 88
  const CODEC_X = 445,
    CODEC_W = 100,
    CODEC_H = 30
  const RES_X = 563

  // Row 1 — byte boxes
  const BYTE_W = 13,
    BYTE_G = 1,
    BYTE_H = 28
  const R1_TOP = 48,
    R1_CY = R1_TOP + BYTE_H / 2

  // Row 2 — token boxes: each token = 2 byte-boxes (uint16 = 2 bytes per r50k token ID)
  const TOK_BYTE_W = BYTE_W,
    TOK_BYTE_G = 1, // gap between the 2 bytes of one token
    TOK_GROUP_GAP = 8, // gap between different tokens
    TOK_H = BYTE_H // same box height as row 1 — a byte is a byte
  const R2_TOP = 190,
    R2_CY = R2_TOP + TOK_H / 2

  // Build byte box positions
  let bx = REP_X
  const byteBoxes = CHARS.map((ch) => {
    const box = { x: bx, ch }
    bx += BYTE_W + BYTE_G
    return box
  })
  const byteEndX = bx - BYTE_G

  // Build token box positions — each token renders as 2 fixed-width byte boxes
  const GROUP_W = TOK_BYTE_W * 2 + TOK_BYTE_G
  let tx = REP_X
  const tokenBoxes = TOKENS.map(({ t }) => {
    const box = { x: tx, t }
    tx += GROUP_W + TOK_GROUP_GAP
    return box
  })
  const tokEndX = tx - TOK_GROUP_GAP

  return (
    <div style={{ margin: '1.5rem 0' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{
          width: '100%',
          maxWidth: `${W * 1.3}px`,
          display: 'block',
          margin: '0 auto',
          fontFamily: 'Inter, ui-sans-serif, sans-serif',
          borderRadius: '10px',
        }}
        aria-label="Byte codec path vs token + ANS path comparison"
      >
        <defs>
          <marker id={mid} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={arrowC} />
          </marker>
        </defs>

        <rect width={W} height={H} rx="10" fill={bg} />
        <line x1="0" y1="140" x2={W} y2="140" stroke={divider} strokeWidth="1" />

        {/* Row labels */}
        <text x="8" y="20" fontSize="10" fontWeight="700" fill={textMuted} letterSpacing="0.06em">
          BYTE CODEC PATH
        </text>
        <text x="8" y="158" fontSize="10" fontWeight="700" fill={textMuted} letterSpacing="0.06em">
          TOKEN + ANS PATH
        </text>

        {/* ═══ ROW 1: BYTES ═══ */}

        <rect
          x={INP_X}
          y={R1_TOP}
          width={INP_W}
          height={INP_H}
          rx="5"
          fill={pillBg}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text x={INP_X + INP_W / 2} y={R1_CY + 4} textAnchor="middle" fontSize="11" fill={textMain}>
          text
        </text>

        <line
          x1={INP_X + INP_W}
          y1={R1_CY}
          x2={REP_X - 6}
          y2={R1_CY}
          stroke={arrowC}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        {byteBoxes.map((b, i) => (
          <g key={i}>
            <rect
              x={b.x}
              y={R1_TOP}
              width={BYTE_W}
              height={BYTE_H}
              rx="2"
              fill={byteFill}
              stroke={byteStroke}
              strokeWidth="0.75"
            />
            <text
              x={b.x + BYTE_W / 2}
              y={R1_CY + 3}
              textAnchor="middle"
              fontSize="7.5"
              fontFamily="monospace"
              fill={byteText}
            >
              {b.ch}
            </text>
          </g>
        ))}

        <text
          x={(REP_X + byteEndX) / 2}
          y={R1_TOP + BYTE_H + 14}
          textAnchor="middle"
          fontSize="9"
          fill={textMuted}
        >
          1,600 chars = 1,600 bytes (UTF-8)
        </text>

        <line
          x1={byteEndX + 4}
          y1={R1_CY}
          x2={CODEC_X - 6}
          y2={R1_CY}
          stroke={arrowC}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        <rect
          x={CODEC_X}
          y={R1_TOP}
          width={CODEC_W}
          height={CODEC_H}
          rx="5"
          fill={pillBg}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text
          x={CODEC_X + CODEC_W / 2}
          y={R1_CY + 4}
          textAnchor="middle"
          fontSize="10"
          fill={textMuted}
        >
          LZ4
        </text>

        <line
          x1={CODEC_X + CODEC_W}
          y1={R1_CY}
          x2={RES_X - 4}
          y2={R1_CY}
          stroke={arrowC}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        <text x={RES_X} y={R1_CY - 5} fontSize="11" fontWeight="600" fill={textMuted}>
          1,233 bytes
        </text>
        <text x={RES_X} y={R1_CY + 11} fontSize="16" fontWeight="700" fill={textMuted}>
          1.3×
        </text>

        {/* ═══ ROW 2: TOKENS ═══ */}

        <rect
          x={INP_X}
          y={R2_TOP}
          width={INP_W}
          height={INP_H}
          rx="5"
          fill={pillBg}
          stroke={pillStroke}
          strokeWidth="1.5"
        />
        <text x={INP_X + INP_W / 2} y={R2_CY + 4} textAnchor="middle" fontSize="11" fill={textMain}>
          text
        </text>

        <line
          x1={INP_X + INP_W}
          y1={R2_CY}
          x2={REP_X - 6}
          y2={R2_CY}
          stroke={arrowC}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        {tokenBoxes.map((tok, i) => (
          <g key={i}>
            {/* 2 byte-boxes per token = uint16 token ID */}
            <rect
              x={tok.x}
              y={R2_TOP}
              width={TOK_BYTE_W}
              height={TOK_H}
              rx="2"
              fill={tokFill}
              stroke={tokStroke}
              strokeWidth="1"
            />
            <rect
              x={tok.x + TOK_BYTE_W + TOK_BYTE_G}
              y={R2_TOP}
              width={TOK_BYTE_W}
              height={TOK_H}
              rx="2"
              fill={tokFill}
              stroke={tokStroke}
              strokeWidth="1"
            />
            <text
              x={tok.x + GROUP_W / 2}
              y={i % 2 === 0 ? R2_TOP - 16 : R2_TOP - 6}
              textAnchor="middle"
              fontSize="7"
              fontFamily="monospace"
              fontWeight="600"
              fill={tokText}
            >
              {tok.t}
            </text>
          </g>
        ))}

        <text
          x={(REP_X + tokEndX) / 2}
          y={R2_TOP + TOK_H + 14}
          textAnchor="middle"
          fontSize="9"
          fill={textMuted}
        >
          328 tokens × 2 bytes = 656 bytes (uint16 r50k)
        </text>

        <line
          x1={tokEndX + 4}
          y1={R2_CY}
          x2={CODEC_X - 6}
          y2={R2_CY}
          stroke={arrowC}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        <rect x={CODEC_X} y={R2_TOP} width={CODEC_W} height={CODEC_H} rx="5" fill="#10b981" />
        <text
          x={CODEC_X + CODEC_W / 2}
          y={R2_CY + 4}
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill="white"
        >
          ANS
        </text>

        <line
          x1={CODEC_X + CODEC_W}
          y1={R2_CY}
          x2={RES_X - 4}
          y2={R2_CY}
          stroke={arrowC}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
        />

        <text x={RES_X} y={R2_CY - 5} fontSize="11" fontWeight="600" fill="#10b981">
          552 bytes
        </text>
        <text x={RES_X} y={R2_CY + 11} fontSize="16" fontWeight="700" fill="#10b981">
          2.9×
        </text>

        {/* Footnote */}
        <text x="8" y="278" fontSize="9" fill={textMuted}>
          first 20 chars shown; r50k tokenizer (GPT-2 BPE, 50,257-token vocab); same 1,600-byte
          reference doc; static ANS table trained on WikiText-103
        </text>
      </svg>
    </div>
  )
}

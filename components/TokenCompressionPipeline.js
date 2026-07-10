import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

// All figures verified with tiktoken.get_encoding('r50k_base') + real lz4.frame.compress
// + an entropy estimate against the same static WikiText-103-trained r50k frequency
// table used elsewhere in this post (public/static/r50k_probs.bin).
const PRESETS = [
  {
    key: 'english',
    label: 'English prose',
    raw: 799,
    tokens: 163,
    uint16: 326,
    lz4: 708,
    ans: 270,
    bytePreview: 'Token-native storage '.split(''),
    tokenPreview: ['Token', '-', 'native', ' storage', ' persists', ' documents', ' as', ' token'],
  },
  {
    key: 'code',
    label: 'Python code',
    raw: 751,
    tokens: 328,
    uint16: 656,
    lz4: 533,
    ans: 640,
    bytePreview: 'def compress(text): '.split(''),
    tokenPreview: ['def', ' compress', '(', 'text', ')', ':', '↵', ' '],
  },
  {
    key: 'thai',
    label: 'Thai script',
    raw: 1818,
    tokens: 1212,
    uint16: 2424,
    lz4: 886,
    ans: 2655,
    // r50k has no real merges for Thai, so both raw bytes and most tokens are
    // shown as hex, single UTF-8 continuation bytes don't decode to valid text alone.
    bytePreview: ['E0', 'B8', 'AB', 'E0', 'B8', 'AD', 'E0', 'B9', '84', 'E0', 'B8', 'AD'],
    tokenPreview: ['E0B8', 'AB', 'E0B8', 'AD', 'E0B9', '84', 'E0B8', 'AD'],
  },
]

export default function TokenCompressionPipeline() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'

  const [presetIdx, setPresetIdx] = useState(0)
  const [ansOn, setAnsOn] = useState(true)
  const preset = PRESETS[presetIdx]

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
  const packColor = dark ? '#60a5fa' : '#2563eb'

  const W = 640
  const H = 330
  const mid = 'tcp-arrow'

  const INP_X = 8,
    INP_W = 62,
    INP_H = 30
  const REP_X = 88
  const CODEC_X = 445,
    CODEC_W = 100,
    CODEC_H = 30
  const RES_X = 563

  const BYTE_W = 13,
    BYTE_G = 1,
    BYTE_H = 28
  const R1_TOP = 48,
    R1_CY = R1_TOP + BYTE_H / 2

  const TOK_BYTE_W = BYTE_W,
    TOK_BYTE_G = 1,
    TOK_GROUP_GAP = 8,
    TOK_H = BYTE_H
  const R2_TOP = 210,
    R2_CY = R2_TOP + TOK_H / 2

  const bytePreviewFull = [...preset.bytePreview, '…']
  let bx = REP_X
  const byteBoxes = bytePreviewFull.map((ch) => {
    const box = { x: bx, ch }
    bx += BYTE_W + BYTE_G
    return box
  })
  const byteEndX = bx - BYTE_G

  const tokenPreviewFull = [...preset.tokenPreview, '…']
  const GROUP_W = TOK_BYTE_W * 2 + TOK_BYTE_G
  let tx = REP_X
  const tokenBoxes = tokenPreviewFull.map((t) => {
    const box = { x: tx, t }
    tx += GROUP_W + TOK_GROUP_GAP
    return box
  })
  const tokEndX = tx - TOK_GROUP_GAP

  const lz4Ratio = preset.raw / preset.lz4
  const packRatio = preset.raw / preset.uint16
  const ansRatio = preset.raw / preset.ans
  const tokResultBytes = ansOn ? preset.ans : preset.uint16
  const tokResultRatio = ansOn ? ansRatio : packRatio
  const lossColor = '#ef4444'
  const resultColor = tokResultRatio < 1 ? lossColor : ansOn ? tokStroke : packColor

  // Bars are scaled against the largest raw byte count across presets so
  // switching presets also visibly changes the starting bar length, clamped
  // so a compression loss (result bigger than raw) doesn't overflow the canvas.
  const MAX_RAW = Math.max(...PRESETS.map((p) => p.raw))
  const BAR_MAX_W = 100
  const clampBar = (v) => Math.min(BAR_MAX_W, Math.max(4, (v / MAX_RAW) * BAR_MAX_W))
  const lz4BarW = clampBar(preset.lz4)
  const tokBarW = clampBar(tokResultBytes)

  return (
    <div style={{ margin: '1.5rem 0' }}>
      {/* Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          fontFamily: 'Inter, ui-sans-serif, sans-serif',
        }}
      >
        {PRESETS.map((p, i) => (
          <button
            key={p.key}
            onClick={() => setPresetIdx(i)}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              background:
                presetIdx === i ? (dark ? '#0f172a' : '#1e293b') : dark ? '#334155' : '#e2e8f0',
              color: presetIdx === i ? '#ffffff' : dark ? '#94a3b8' : '#475569',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {p.label}
          </button>
        ))}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginLeft: 'auto',
            fontSize: 12,
            fontWeight: 600,
            color: dark ? '#94a3b8' : '#475569',
            cursor: 'pointer',
          }}
        >
          <input type="checkbox" checked={ansOn} onChange={(e) => setAnsOn(e.target.checked)} />
          Include ANS step
        </label>
      </div>

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
        aria-label="Byte codec path vs token path comparison, interactive"
      >
        <defs>
          <marker id={mid} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={arrowC} />
          </marker>
        </defs>

        <rect width={W} height={H} rx="10" fill={bg} />
        <line x1="0" y1="160" x2={W} y2="160" stroke={divider} strokeWidth="1" />

        {/* Row labels */}
        <text x="8" y="20" fontSize="10" fontWeight="700" fill={textMuted} letterSpacing="0.06em">
          BYTE CODEC PATH
        </text>
        <text x="8" y="178" fontSize="10" fontWeight="700" fill={textMuted} letterSpacing="0.06em">
          TOKEN PATH (r50k)
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
              style={{ transition: 'fill 0.2s ease' }}
            />
            <text
              x={b.x + BYTE_W / 2}
              y={R1_CY + 3}
              textAnchor="middle"
              fontSize={b.ch.length > 1 ? '6.5' : '7.5'}
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
          {preset.raw.toLocaleString()} bytes raw UTF-8
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

        <text
          x={RES_X}
          y={R1_CY - 5}
          fontSize="11"
          fontWeight="600"
          fill={textMuted}
          style={{ transition: 'opacity 0.2s' }}
        >
          {preset.lz4.toLocaleString()} bytes
        </text>
        <text x={RES_X} y={R1_CY + 11} fontSize="16" fontWeight="700" fill={textMuted}>
          {lz4Ratio.toFixed(2)}×
        </text>
        <text x={RES_X} y={R1_CY + 23} fontSize="8" fill={textMuted}>
          compression ratio
        </text>
        <rect
          x={RES_X}
          y={R1_CY + 29}
          width={lz4BarW}
          height="4"
          rx="2"
          fill={textMuted}
          style={{ transition: 'width 0.3s ease' }}
        />

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
              fontSize={tok.t.length > 3 ? '6' : '7'}
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
          {preset.tokens.toLocaleString()} tokens × 2 bytes = {preset.uint16.toLocaleString()} bytes
          (uint16 r50k)
        </text>
        <text
          x={(REP_X + tokEndX) / 2}
          y={R2_TOP + TOK_H + 34}
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill={packRatio >= 1 ? packColor : '#ef4444'}
        >
          {packRatio.toFixed(2)}× before ANS even runs{packRatio < 1 ? ' (packing loses here)' : ''}
        </text>

        <line
          x1={tokEndX + 4}
          y1={R2_CY}
          x2={CODEC_X - 6}
          y2={R2_CY}
          stroke={arrowC}
          strokeWidth="1.5"
          markerEnd={`url(#${mid})`}
          style={{ transition: 'opacity 0.2s' }}
          opacity={ansOn ? 1 : 0.3}
        />
        {!ansOn && (
          <line
            x1={tokEndX + 4}
            y1={R2_CY + 20}
            x2={RES_X - 4}
            y2={R2_CY + 20}
            stroke={packColor}
            strokeWidth="1.5"
            strokeDasharray="4 3"
            markerEnd={`url(#${mid})`}
          />
        )}

        <rect
          x={CODEC_X}
          y={R2_TOP}
          width={CODEC_W}
          height={CODEC_H}
          rx="5"
          fill={ansOn ? '#10b981' : 'none'}
          stroke={ansOn ? '#10b981' : tokStroke}
          strokeDasharray={ansOn ? '0' : '3 3'}
          style={{ transition: 'fill 0.25s ease, opacity 0.25s ease' }}
          opacity={ansOn ? 1 : 0.5}
        />
        <text
          x={CODEC_X + CODEC_W / 2}
          y={R2_CY + 4}
          textAnchor="middle"
          fontSize="10"
          fontWeight="700"
          fill={ansOn ? 'white' : textMuted}
          style={{ transition: 'fill 0.25s ease' }}
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
          opacity={ansOn ? 1 : 0.3}
          style={{ transition: 'opacity 0.2s' }}
        />

        <text
          x={RES_X}
          y={R2_CY - 5}
          fontSize="11"
          fontWeight="600"
          fill={resultColor}
          style={{ transition: 'fill 0.25s ease' }}
        >
          {tokResultBytes.toLocaleString()} bytes
        </text>
        <text
          x={RES_X}
          y={R2_CY + 11}
          fontSize="16"
          fontWeight="700"
          fill={resultColor}
          style={{ transition: 'fill 0.25s ease' }}
        >
          {tokResultRatio.toFixed(2)}×
        </text>
        <text
          x={RES_X}
          y={R2_CY + 23}
          fontSize="8"
          fill={resultColor}
          style={{ transition: 'fill 0.25s ease' }}
        >
          compression ratio
        </text>
        <rect
          x={RES_X}
          y={R2_CY + 29}
          width={tokBarW}
          height="4"
          rx="2"
          fill={resultColor}
          style={{ transition: 'width 0.3s ease, fill 0.25s ease' }}
        />

        {/* Footnote */}
        <text x="8" y={H - 10} fontSize="9" fill={textMuted}>
          preview truncated; r50k tokenizer (GPT-2 BPE, 50,257-token vocab); LZ4 and ANS sizes are
          real, measured per sample (ANS via the static WikiText-103-trained table used elsewhere in
          this post)
        </text>
      </svg>
    </div>
  )
}

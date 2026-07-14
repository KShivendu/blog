import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

// All figures verified with tiktoken (r50k_base or cl100k_base, per preset) + real
// lz4.frame.compress + an entropy estimate against the same static WikiText-103-trained
// frequency table used elsewhere in this post (public/static/r50k_probs.bin, or the
// equivalent cl100k table for the Python preset).
const TOKENIZER_INFO = {
  r50k: { vocab: '50,257', family: 'GPT-2 BPE', packLabel: 'uint16 r50k', bytesPerToken: 2 },
  cl100k: { vocab: '100,277', family: 'GPT-4 BPE', packLabel: '3-byte cl100k', bytesPerToken: 3 },
  o200k: { vocab: '200,019', family: 'GPT-4o BPE', packLabel: '3-byte o200k', bytesPerToken: 3 },
}

const PRESETS = [
  {
    key: 'english',
    label: 'English prose',
    tokenizer: 'r50k',
    // A short passage about the post's own subject, real tiktoken/lz4/ANS numbers
    // (ANS estimated against the same WikiText-103-trained table used in the benchmark).
    raw: 571,
    tokens: 107,
    packed: 214,
    lz4: 497,
    ans: 175,
    bytePreview: 'Token-native compres'.split(''),
    tokenPreview: ['Token', '-', 'native', ' compression', ' stores', ' the', ' token', ' IDs'],
  },
  {
    key: 'code',
    label: 'Python code',
    tokenizer: 'cl100k',
    // A real Django app config file (django_semantic_search/apps.py), tokenized with
    // cl100k. Picked over the earlier compress/decompress snippet because that one
    // happened to have unusually little repeated structure for its length, so LZ4
    // edged out raw token packing; this file is a more typical case where repeated
    // identifiers (django_semantic_search, settings, setting) let BPE + ANS win clearly.
    raw: 499,
    tokens: 93,
    packed: 279,
    lz4: 330,
    ans: 232,
    bytePreview: 'from django.apps im'.split(''),
    tokenPreview: ['from', ' django', '.apps', ' import', ' AppConfig', '↵', 'from', ' django'],
  },
  {
    key: 'hindi',
    label: 'Hindi script',
    tokenizer: 'o200k',
    // The opening line of Hindi Wikipedia's Mahatma Gandhi article, tokenized with
    // o200k. o200k's merges cover Devanagari far better than r50k/cl100k do (GPT-4o's
    // tokenizer was built with much more multilingual coverage), so tokens decode
    // to legible subwords instead of falling back to single raw bytes.
    raw: 695,
    tokens: 85,
    packed: 255,
    lz4: 476,
    ans: 232,
    bytePreview: 'मोहनदास करमचन्द '.split(''),
    tokenPreview: ['मो', 'हन', 'द', 'ास', ' कर', 'म', 'च', 'न्द'],
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

  // Palette mirrors BarChart/LineChart's palette(isDark) so this widget reads as
  // a sibling of the site's native chart components.
  const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
  const accent = dark ? '#34d399' : '#047857'
  const accentInk = dark ? '#08110c' : '#ffffff'

  const bg = dark ? '#0d1310' : '#ffffff' // card
  const divider = dark ? '#1e2822' : '#e0e4e1' // border
  const textMain = dark ? '#dde6e0' : '#14161a' // ink
  const textMuted = dark ? '#8a968e' : '#5f6570' // muted
  const arrowC = dark ? '#38473e' : '#c8cfc9' // axis
  const pillBg = dark ? '#0d1310' : '#ffffff' // card
  const pillStroke = dark ? '#1e2822' : '#e0e4e1' // border
  const byteFill = dark ? 'rgba(255,255,255,0.04)' : '#f0f2f0'
  const byteStroke = dark ? '#38473e' : '#c8cfc9' // axis
  const byteText = dark ? '#8a968e' : '#5f6570' // muted
  const tokFill = dark ? 'rgba(52,211,153,0.12)' : 'rgba(4,120,87,0.10)'
  const tokStroke = accent
  const tokText = dark ? '#6ee7b7' : '#065f46'
  // Secondary chart data colour (teal) — keeps the raw-packing / no-ANS result
  // visually distinct from the accent-green token cells without reintroducing blue.
  const packColor = dark ? '#22d3ee' : '#0891b2'

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

  const tokInfo = TOKENIZER_INFO[preset.tokenizer]
  const lz4Ratio = preset.raw / preset.lz4
  const packRatio = preset.raw / preset.packed
  const ansRatio = preset.raw / preset.ans
  const tokResultBytes = ansOn ? preset.ans : preset.packed
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
    <div
      style={{
        margin: '1.5rem 0',
        border: `1px solid ${divider}`,
        borderRadius: 2,
        background: bg,
        padding: '10px 10px 6px',
      }}
    >
      {/* Controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          marginBottom: 10,
          fontFamily: MONO,
        }}
      >
        {/* Segmented preset toggle — matches BarChart's on-theme "views" buttons. */}
        <div style={{ display: 'flex' }}>
          {PRESETS.map((p, i) => {
            const on = presetIdx === i
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setPresetIdx(i)}
                style={{
                  appearance: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  lineHeight: 1,
                  padding: '6px 12px',
                  border: `1px solid ${on ? accent : divider}`,
                  marginLeft: i === 0 ? 0 : '-1px',
                  background: on ? accent : 'transparent',
                  color: on ? accentInk : textMuted,
                  fontFamily: 'inherit',
                  fontWeight: on ? 600 : 400,
                  zIndex: on ? 1 : 0,
                  position: 'relative',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            marginLeft: 'auto',
            fontSize: 12,
            fontWeight: 600,
            color: textMuted,
            fontFamily: MONO,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={ansOn}
            onChange={(e) => setAnsOn(e.target.checked)}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
          />
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 14,
              height: 14,
              border: `1px solid ${ansOn ? accent : byteStroke}`,
              background: ansOn ? accent : 'transparent',
              color: accentInk,
              fontSize: 10,
              lineHeight: 1,
              transition: 'background 0.15s, border-color 0.15s',
            }}
          >
            {ansOn ? '✓' : ''}
          </span>
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
          fontFamily: MONO,
          borderRadius: '2px',
        }}
        aria-label="Byte codec path vs token path comparison, interactive"
      >
        <defs>
          <marker id={mid} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={arrowC} />
          </marker>
        </defs>

        <rect width={W} height={H} rx="2" fill={bg} />
        <line x1="0" y1="160" x2={W} y2="160" stroke={divider} strokeWidth="1" />

        {/* Row labels */}
        <text x="8" y="20" fontSize="10" fontWeight="700" fill={textMuted} letterSpacing="0.06em">
          BYTE CODEC PATH
        </text>
        <text x="8" y="178" fontSize="10" fontWeight="700" fill={textMuted} letterSpacing="0.06em">
          TOKEN PATH ({preset.tokenizer})
        </text>

        {/* ═══ ROW 1: BYTES ═══ */}

        <rect
          x={INP_X}
          y={R1_TOP}
          width={INP_W}
          height={INP_H}
          rx="2"
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
          rx="2"
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
          rx="2"
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
          {preset.tokens.toLocaleString()} tokens × {tokInfo.bytesPerToken} bytes ={' '}
          {preset.packed.toLocaleString()} bytes ({tokInfo.packLabel})
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
          rx="2"
          fill={ansOn ? accent : 'none'}
          stroke={ansOn ? accent : tokStroke}
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
          fill={ansOn ? accentInk : textMuted}
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
          preview truncated; {preset.tokenizer} tokenizer ({tokInfo.family}, {tokInfo.vocab}-token
          vocab); LZ4 and ANS sizes are real, measured per sample (ANS via the static
          WikiText-103-trained table used elsewhere in this post)
        </text>
      </svg>
    </div>
  )
}

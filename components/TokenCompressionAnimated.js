import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

// Prototype: the same raw bytes split into two independent, time-synced
// pipelines — byte-codec (LZ4) on top, token path on the bottom — so you can
// watch the *same* input diverge into two different representations instead
// of only ever seeing one path's final number.
const TOKENIZER_INFO = {
  r50k: { vocab: '50,257', family: 'GPT-2 BPE', bytesPerToken: 2, packLabel: 'uint16 r50k' },
  cl100k: { vocab: '100,277', family: 'GPT-4 BPE', bytesPerToken: 3, packLabel: '3-byte cl100k' },
  o200k: { vocab: '200,019', family: 'GPT-4o BPE', bytesPerToken: 3, packLabel: '3-byte o200k' },
}

const PRESETS = [
  {
    key: 'english',
    label: 'English prose',
    tokenizer: 'r50k',
    raw: 571,
    tokens: 107,
    packed: 214,
    lz4: 497,
    ans: 175,
    bytePreview: 'Token-native compres'.split(''),
    tokenPreview: ['Token', '-', 'native', ' compression', ' stores', ' the', ' token', ' IDs'],
    tokenIds: [30642, 12, 30191],
    byteHex: [
      '54',
      '6F',
      '6B',
      '65',
      '6E',
      '2D',
      '6E',
      '61',
      '74',
      '69',
      '76',
      '65',
      '20',
      '63',
      '6F',
      '6D',
      '70',
      '72',
      '65',
      '73',
    ],
  },
  {
    key: 'code',
    label: 'Python code',
    tokenizer: 'cl100k',
    raw: 499,
    tokens: 93,
    packed: 279,
    lz4: 330,
    ans: 232,
    bytePreview: 'from django.apps im'.split(''),
    tokenPreview: ['from', ' django', '.apps', ' import', ' AppConfig', '↵', 'from', ' django'],
    tokenIds: [1527, 8426, 40813],
    byteHex: [
      '66',
      '72',
      '6F',
      '6D',
      '20',
      '64',
      '6A',
      '61',
      '6E',
      '67',
      '6F',
      '2E',
      '61',
      '70',
      '70',
      '73',
      '20',
      '69',
      '6D',
    ],
  },
  {
    key: 'hindi',
    label: 'Hindi script',
    tokenizer: 'o200k',
    raw: 695,
    tokens: 85,
    packed: 255,
    lz4: 476,
    ans: 232,
    bytePreview: 'मोहनदास करमचन्द '.split(''),
    tokenPreview: ['मो', 'हन', 'द', 'ास', ' कर', 'म', 'च', 'न्द'],
    tokenIds: [132049, 70527, 2587, 6750, 4026, 1637, 3774, 21839],
    byteHex: [
      'E0',
      'A4',
      'AE',
      'E0',
      'A5',
      '8B',
      'E0',
      'A4',
      'B9',
      'E0',
      'A4',
      'A8',
      'E0',
      'A4',
      'A6',
      'E0',
      'A4',
      'BE',
      'E0',
      'A4',
      'B8',
      '20',
      'E0',
      'A4',
      '95',
      'E0',
      'A4',
      'B0',
      'E0',
      'A4',
      'AE',
      'E0',
      'A4',
      '9A',
      'E0',
      'A4',
      'A8',
      'E0',
      'A5',
      '8D',
      'E0',
      'A4',
      'A6',
      '20',
    ],
  },
]

// Phase boundaries, as fractions of the full 0-1 cycle. Phase 0 is shared
// (both paths read the same raw bytes); phases 1-3 run in the two lanes at
// the *same* time boundaries, so the two paths visibly stay in lockstep.
const P0 = 0.2 // shared: chars -> raw UTF-8 bytes
const P1 = 0.46 // lane 1: LZ4 sliding-window match search | BPE merge into tokens
const P2 = 0.72 // lane 2: feed the LZ4 engine | pack token IDs into fixed-width bytes
const P3 = 1.0 // lane 3: LZ4 output bytes | ANS entropy coding

const CYCLE_MS = 8000

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}

// The canvas height tracks how much each phase actually draws, instead of
// staying fixed at the tallest phase's height for the whole loop (which
// left a huge blank strip under the shorter phases). It eases across each
// phase boundary instead of popping.
const H_PHASE0 = 110 // just the shared byte row
const H_PHASE1 = 380 // BPE token boxes reach the lowest
const H_PHASE2 = 340 // LZ4 engine + packing bar
const H_PHASE3 = 340 // final output bars
const H_TRANS = 0.025 // fraction of the cycle spent easing between heights

// Grows/shrinks starting exactly AT each phase boundary (never before it) so
// the frame doesn't visibly expand while still-old-phase content is on
// screen — the resize lands together with the new phase's content fading in.
function heightAt(p) {
  const cross = (from, to, boundary) => {
    const t = (p - boundary) / (2 * H_TRANS)
    return lerp(from, to, smoothstep(t))
  }
  if (p < P0) return H_PHASE0
  if (p < P0 + 2 * H_TRANS) return cross(H_PHASE0, H_PHASE1, P0)
  if (p < P1) return H_PHASE1
  if (p < P1 + 2 * H_TRANS) return cross(H_PHASE1, H_PHASE2, P1)
  if (p < P2) return H_PHASE2
  if (p < P2 + 2 * H_TRANS) return cross(H_PHASE2, H_PHASE3, P2)
  return H_PHASE3
}

export default function TokenCompressionAnimated() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'

  const [presetIdx, setPresetIdx] = useState(0)
  const [progress, setProgress] = useState(0) // 0..1
  const [playing, setPlaying] = useState(true)
  const playingRef = useRef(true) // mirrors `playing` for a hard stop inside the raf loop
  const rafRef = useRef(null)
  const lastTsRef = useRef(null)
  const preset = PRESETS[presetIdx]

  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  useEffect(() => {
    if (!playing) return
    const step = (ts) => {
      if (!playingRef.current) return // hard-stop: never advance or reschedule while paused
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts
      setProgress((p) => (p + dt / CYCLE_MS) % 1)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(rafRef.current)
      lastTsRef.current = null
    }
  }, [playing])

  const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
  const accent = dark ? '#34d399' : '#047857'
  const accentInk = dark ? '#08110c' : '#ffffff'
  const bg = dark ? '#0d1310' : '#ffffff'
  const divider = dark ? '#1e2822' : '#e0e4e1'
  const textMain = dark ? '#dde6e0' : '#14161a'
  const textMuted = dark ? '#8a968e' : '#5f6570'
  const byteFill = dark ? 'rgba(255,255,255,0.04)' : '#f0f2f0'
  const byteStroke = dark ? '#38473e' : '#c8cfc9'
  const byteText = dark ? '#8a968e' : '#5f6570'
  const tokFill = dark ? 'rgba(52,211,153,0.12)' : 'rgba(4,120,87,0.10)'
  const tokStroke = accent
  const tokText = dark ? '#6ee7b7' : '#065f46'
  const packColor = dark ? '#22d3ee' : '#0891b2'
  const lz4Accent = dark ? '#f59e0b' : '#b45309'
  const lz4Fill = dark ? 'rgba(245,158,11,0.12)' : 'rgba(180,83,9,0.10)'

  const tokInfo = TOKENIZER_INFO[preset.tokenizer]
  const lz4Ratio = preset.raw / preset.lz4
  const packRatio = preset.raw / preset.packed
  const ansRatio = preset.raw / preset.ans

  const W = 640
  const H = heightAt(progress)
  const BOX_H = 26
  const BYTE_W = 14,
    BYTE_G = 2
  const bytePreviewFull = [...preset.bytePreview, '…']
  const totalByteW = bytePreviewFull.length * (BYTE_W + BYTE_G) - BYTE_G
  const rowStartX = (W - totalByteW) / 2
  const GROUP_W = BYTE_W * 2 + BYTE_G

  const SHARED_Y = 40 // shared raw-byte row, phase 0 only
  const TOP_LABEL_Y = 98
  const TOP_CY = 150 // byte-codec (LZ4) lane
  const DIVIDER_Y = 202
  const BOT_LABEL_Y = 224
  const BOT_CY = 268 // token-path lane
  const TOK_BOX_Y = BOT_CY + 38

  // Map preview tokens back onto the exact byte range they were merged from.
  let consumed = 0
  const tokenGroups = []
  for (let ti = 0; ti < preset.tokenPreview.length; ti++) {
    const t = preset.tokenPreview[ti]
    if (consumed + t.length > preset.bytePreview.length) break
    tokenGroups.push({ token: t, id: preset.tokenIds[ti], start: consumed, len: t.length })
    consumed += t.length
  }
  const leftoverTokenCount = preset.tokens - tokenGroups.length

  const inPhase = (start, end) => Math.max(0, Math.min(1, (progress - start) / (end - start)))
  const bytesT = inPhase(0, P0)
  const stage1T = inPhase(P0, P1)
  const stage2T = inPhase(P1, P2)
  const stage3T = inPhase(P2, P3)
  // Quick, non-overlapping crossfade: the shared row is gone before the
  // lane's own copy is more than a third in, instead of both rows sitting
  // at partial opacity on top of each other for a big chunk of phase 1.
  const sharedOpacity = 1 - Math.min(1, stage1T / 0.12)
  const splitOpacity = Math.min(1, Math.max(0, (stage1T - 0.04) / 0.16))
  // The diverging connector lines are a one-time "it just split" flourish,
  // not a permanent fixture — they flash in and back out early in phase 1
  // instead of hanging in mid-air, disconnected from anything, for the
  // rest of the loop.
  const linesOpacity = Math.max(0, Math.min(1, stage1T * 8) - Math.max(0, (stage1T - 0.25) * 8))

  const phaseLabel =
    progress < P0
      ? 'Reading raw UTF-8 bytes (shared input, about to split)'
      : progress < P1
      ? 'LZ4: sliding-window match search   ·   tokens: BPE merges bytes into subwords'
      : progress < P2
      ? 'LZ4: feeding the match/literal encoder   ·   tokens: packing IDs into fixed-width bytes'
      : 'LZ4: writing compressed output   ·   tokens: ANS entropy coding'

  const MAX_RAW = Math.max(...PRESETS.map((p) => p.raw))
  const BAR_MAX_W = 380
  const barW = (v) => Math.max(6, (v / MAX_RAW) * BAR_MAX_W)

  // token-path current bytes: raw -> packed (stage2) -> ans (stage3)
  let curBytes, curLabel, curColor
  if (progress < P1) {
    curBytes = preset.raw
    curLabel = 'raw UTF-8'
    curColor = textMuted
  } else if (progress < P2) {
    curBytes = lerp(preset.raw, preset.packed, stage2T)
    curLabel = `packing -> ${tokInfo.packLabel}`
    curColor = packColor
  } else {
    curBytes = lerp(preset.packed, preset.ans, stage3T)
    curLabel = 'ANS entropy coding'
    curColor = accent
  }
  const curRatio = preset.raw / curBytes

  // lz4-lane current bytes: raw the whole time until stage3, then shrinks to lz4
  const lz4CurBytes = progress < P2 ? preset.raw : lerp(preset.raw, preset.lz4, stage3T)
  const lz4CurRatio = preset.raw / lz4CurBytes

  return (
    <div
      style={{
        margin: '1.5rem 0',
        border: `1px solid ${divider}`,
        borderRadius: 2,
        background: bg,
        padding: '10px 10px 8px',
      }}
    >
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
        <div style={{ display: 'flex' }}>
          {PRESETS.map((p, i) => {
            const on = presetIdx === i
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setPresetIdx(i)
                  setProgress(0)
                }}
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
                  position: 'relative',
                }}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          style={{
            marginLeft: 'auto',
            appearance: 'none',
            cursor: 'pointer',
            fontSize: 12,
            padding: '6px 10px',
            border: `1px solid ${divider}`,
            background: 'transparent',
            color: textMuted,
            fontFamily: MONO,
          }}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
      </div>

      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        onChange={(e) => {
          setPlaying(false)
          setProgress(Number(e.target.value) / 1000)
        }}
        style={{ width: '100%', marginBottom: 6, accentColor: accent }}
      />

      <div
        style={{
          fontFamily: MONO,
          fontSize: 10.5,
          fontWeight: 600,
          color: textMuted,
          marginBottom: 6,
          height: 14,
        }}
      >
        {phaseLabel}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block', margin: '0 auto', fontFamily: MONO }}
        aria-label="Same raw bytes, split into a parallel LZ4 path and a token path, phases synced"
      >
        <rect width={W} height={H} rx="2" fill={bg} />

        {/* Shared raw-byte row: both paths read the exact same bytes before
            diverging. Fades out right as the two lanes fade in. */}
        <g opacity={sharedOpacity}>
          <text x={rowStartX} y={SHARED_Y - BOX_H / 2 - 8} fontSize="8" fill={textMuted}>
            raw text -&gt; UTF-8 bytes (shared)
          </text>
          {bytePreviewFull.map((ch, i) => {
            const revealAt = i / bytePreviewFull.length
            if (bytesT < revealAt) return null
            return (
              <g key={i}>
                <rect
                  x={rowStartX + i * (BYTE_W + BYTE_G)}
                  y={SHARED_Y - BOX_H / 2}
                  width={BYTE_W}
                  height={BOX_H}
                  rx="2"
                  fill={byteFill}
                  stroke={byteStroke}
                  strokeWidth="0.75"
                />
                <text
                  x={rowStartX + i * (BYTE_W + BYTE_G) + BYTE_W / 2}
                  y={SHARED_Y + 3}
                  textAnchor="middle"
                  fontSize={ch.length > 1 ? '6.5' : '7.5'}
                  fontFamily="monospace"
                  fill={byteText}
                >
                  {ch}
                </text>
              </g>
            )
          })}
        </g>

        {/* Diverging split: one input, two paths. A brief flourish, not a
            permanent fixture — see linesOpacity. */}
        <g opacity={linesOpacity}>
          <line
            x1={W / 2}
            y1={SHARED_Y + BOX_H / 2 + 2}
            x2={W / 2 - 70}
            y2={TOP_LABEL_Y - 10}
            stroke={lz4Accent}
            strokeWidth="1"
            opacity="0.5"
          />
          <line
            x1={W / 2}
            y1={SHARED_Y + BOX_H / 2 + 2}
            x2={W / 2 + 70}
            y2={BOT_LABEL_Y - 10}
            stroke={tokStroke}
            strokeWidth="1"
            opacity="0.5"
          />
        </g>

        {/* ── Lane 1: byte codec path (LZ4) ───────────────────────────── */}
        <g opacity={splitOpacity}>
          <text
            x={8}
            y={TOP_LABEL_Y}
            fontSize="9"
            fontWeight="700"
            fill={lz4Accent}
            letterSpacing="0.06em"
          >
            BYTE CODEC PATH (LZ4)
          </text>

          {progress < P1 && (
            <>
              {/* stage 1: sliding-window match search over the same bytes */}
              {bytePreviewFull.map((ch, i) => (
                <g key={i}>
                  <rect
                    x={rowStartX + i * (BYTE_W + BYTE_G)}
                    y={TOP_CY - BOX_H / 2}
                    width={BYTE_W}
                    height={BOX_H}
                    rx="2"
                    fill={byteFill}
                    stroke={byteStroke}
                    strokeWidth="0.75"
                  />
                  <text
                    x={rowStartX + i * (BYTE_W + BYTE_G) + BYTE_W / 2}
                    y={TOP_CY + 3}
                    textAnchor="middle"
                    fontSize={ch.length > 1 ? '6.5' : '7.5'}
                    fontFamily="monospace"
                    fill={byteText}
                  >
                    {ch}
                  </text>
                </g>
              ))}
              {(() => {
                const winBoxes = 5
                const winW = winBoxes * (BYTE_W + BYTE_G) - BYTE_G + 4
                const maxSlide = totalByteW - winW
                const winX = rowStartX - 2 + lerp(0, Math.max(0, maxSlide), stage1T)
                return (
                  <rect
                    x={winX}
                    y={TOP_CY - BOX_H / 2 - 4}
                    width={winW}
                    height={BOX_H + 8}
                    rx="3"
                    fill="none"
                    stroke={lz4Accent}
                    strokeWidth="1.5"
                  />
                )
              })()}
              <text
                x={W / 2}
                y={TOP_CY + BOX_H / 2 + 16}
                textAnchor="middle"
                fontSize="8"
                fill={textMuted}
              >
                scanning for repeated byte sequences (match window)
              </text>
            </>
          )}

          {progress >= P1 && progress < P2 && (
            <>
              {/* stage 2: feed matches/literals into the LZ4 engine */}
              <rect
                x={rowStartX}
                y={TOP_CY - 10}
                width={totalByteW}
                height="16"
                rx="2"
                fill={byteFill}
                stroke={byteStroke}
                strokeWidth="0.75"
                opacity="0.5"
              />
              <text x={rowStartX} y={TOP_CY - 16} fontSize="7" fill={textMuted}>
                raw bytes
              </text>
              <line
                x1={rowStartX + totalByteW + 6}
                y1={TOP_CY - 2}
                x2={W / 2 - 55}
                y2={TOP_CY - 2}
                stroke={lz4Accent}
                strokeWidth="1"
                markerEnd="url(#arrowLz4)"
              />
              <rect
                x={W / 2 - 50}
                y={TOP_CY - 24}
                width="100"
                height="48"
                rx="4"
                fill={lz4Fill}
                stroke={lz4Accent}
                strokeWidth="1.25"
              />
              <text
                x={W / 2}
                y={TOP_CY - 8}
                textAnchor="middle"
                fontSize="8"
                fontWeight="700"
                fill={lz4Accent}
              >
                LZ4 ENGINE
              </text>
              <rect
                x={W / 2 - 40}
                y={TOP_CY + 2}
                width="80"
                height="8"
                rx="2"
                fill="none"
                stroke={lz4Accent}
                strokeWidth="0.75"
              />
              <rect
                x={W / 2 - 40}
                y={TOP_CY + 2}
                width={80 * stage2T}
                height="8"
                rx="2"
                fill={lz4Accent}
              />
              <text
                x={W / 2}
                y={TOP_CY + BOX_H / 2 + 20}
                textAnchor="middle"
                fontSize="8"
                fill={textMuted}
              >
                encoding match offsets/lengths + literal runs
              </text>
            </>
          )}

          {progress >= P2 && (
            <>
              {/* stage 3: output bytes bar, raw -> lz4 */}
              <rect
                x={(W - BAR_MAX_W) / 2}
                y={TOP_CY - 9}
                width={BAR_MAX_W}
                height="18"
                rx="3"
                fill="none"
                stroke={divider}
                strokeWidth="1"
              />
              <rect
                x={(W - BAR_MAX_W) / 2}
                y={TOP_CY - 9}
                width={barW(lz4CurBytes)}
                height="18"
                rx="3"
                fill={lz4Accent}
              />
              <text
                x={W / 2}
                y={TOP_CY + 32}
                textAnchor="middle"
                fontSize="15"
                fontWeight="700"
                fill={lz4Accent}
              >
                {Math.round(lz4CurBytes).toLocaleString()}B &middot; {lz4CurRatio.toFixed(2)}×
              </text>
              <text x={W / 2} y={TOP_CY + 46} textAnchor="middle" fontSize="8" fill={textMuted}>
                compressed output (from {preset.raw.toLocaleString()}B raw)
              </text>
            </>
          )}

          <defs>
            <marker id="arrowLz4" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill={lz4Accent} />
            </marker>
          </defs>
        </g>

        <line x1={0} y1={DIVIDER_Y} x2={W} y2={DIVIDER_Y} stroke={divider} strokeWidth="1" />

        {/* ── Lane 2: token path ──────────────────────────────────────── */}
        <g opacity={splitOpacity}>
          <text
            x={8}
            y={BOT_LABEL_Y}
            fontSize="9"
            fontWeight="700"
            fill={tokStroke}
            letterSpacing="0.06em"
          >
            TOKEN PATH ({preset.tokenizer})
          </text>
        </g>

        {progress >= P0 && progress < P1 && (
          <g opacity={splitOpacity}>
            <text
              x={rowStartX}
              y={BOT_CY - BOX_H / 2 - 8}
              fontSize="7"
              fontFamily="monospace"
              fill={textMuted}
            >
              real UTF-8 bytes: {preset.byteHex.slice(0, 16).join(' ')}
              {preset.byteHex.length > 16 ? ' …' : ''}
            </text>
            {bytePreviewFull.map((ch, i) => {
              const group = tokenGroups.find((g) => i >= g.start && i < g.start + g.len)
              const dimmed = group ? Math.min(1, stage1T * 2) : 0
              const byteOpacity = 1 - dimmed * 0.6
              return (
                <g key={i} opacity={byteOpacity}>
                  <rect
                    x={rowStartX + i * (BYTE_W + BYTE_G)}
                    y={BOT_CY - BOX_H / 2}
                    width={BYTE_W}
                    height={BOX_H}
                    rx="2"
                    fill={byteFill}
                    stroke={byteStroke}
                    strokeWidth="0.75"
                  />
                  <text
                    x={rowStartX + i * (BYTE_W + BYTE_G) + BYTE_W / 2}
                    y={BOT_CY + 3}
                    textAnchor="middle"
                    fontSize={ch.length > 1 ? '6.5' : '7.5'}
                    fontFamily="monospace"
                    fill={byteText}
                  >
                    {ch}
                  </text>
                </g>
              )
            })}

            {tokenGroups.map((g, gi) => {
              const revealAt = gi / tokenGroups.length
              const localT = Math.min(1, Math.max(0, (stage1T - revealAt) * tokenGroups.length))
              if (localT <= 0) return null
              const gx = rowStartX + g.start * (BYTE_W + BYTE_G) - 2
              const gw = g.len * (BYTE_W + BYTE_G) - BYTE_G + 4
              return (
                <rect
                  key={gi}
                  x={gx}
                  y={BOT_CY - BOX_H / 2 - 2}
                  width={gw}
                  height={BOX_H + 4}
                  rx="3"
                  fill="none"
                  stroke={tokStroke}
                  strokeWidth="1.5"
                  opacity={localT}
                />
              )
            })}

            {tokenGroups.map((g, gi) => {
              const revealAt = gi / tokenGroups.length
              const localT = Math.min(1, Math.max(0, (stage1T - revealAt) * tokenGroups.length))
              if (localT <= 0) return null
              const gx = rowStartX + g.start * (BYTE_W + BYTE_G)
              const gw = g.len * (BYTE_W + BYTE_G) - BYTE_G
              const groupCenterX = gx + gw / 2
              const boxX = groupCenterX - GROUP_W / 2
              const y = TOK_BOX_Y
              return (
                <g key={gi} opacity={localT}>
                  <line
                    x1={groupCenterX}
                    y1={BOT_CY + BOX_H / 2 + 2}
                    x2={groupCenterX}
                    y2={y - 2}
                    stroke={tokStroke}
                    strokeWidth="1"
                    opacity="0.6"
                  />
                  <rect
                    x={boxX}
                    y={y}
                    width={BYTE_W}
                    height={24}
                    rx="2"
                    fill={tokFill}
                    stroke={tokStroke}
                    strokeWidth="1"
                  />
                  <rect
                    x={boxX + BYTE_W + BYTE_G}
                    y={y}
                    width={BYTE_W}
                    height={24}
                    rx="2"
                    fill={tokFill}
                    stroke={tokStroke}
                    strokeWidth="1"
                  />
                  <text
                    x={groupCenterX}
                    y={y + 24 + 11}
                    textAnchor="middle"
                    fontSize={g.token.length > 3 ? '6' : '7'}
                    fontFamily="monospace"
                    fontWeight="600"
                    fill={tokText}
                  >
                    {g.token}
                  </text>
                  <text
                    x={groupCenterX}
                    y={y + 24 + 20}
                    textAnchor="middle"
                    fontSize="5.5"
                    fontFamily="monospace"
                    fill={textMuted}
                  >
                    #{g.id}
                  </text>
                </g>
              )
            })}

            {stage1T > 0.4 && leftoverTokenCount > 0 && (
              <text
                x={W / 2}
                y={TOK_BOX_Y + 24 + 34}
                textAnchor="middle"
                fontSize="8"
                fill={textMuted}
                opacity={Math.min(1, (stage1T - 0.4) * 3)}
              >
                + {leftoverTokenCount.toLocaleString()} more tokens (rest of the document, not
                shown)
              </text>
            )}
          </g>
        )}

        {progress >= P1 && (
          <g opacity={splitOpacity}>
            <text x={W / 2} y={BOT_CY - 30} textAnchor="middle" fontSize="10" fill={textMuted}>
              {preset.tokens.toLocaleString()} tokens
            </text>
            <rect
              x={(W - BAR_MAX_W) / 2}
              y={BOT_CY - 9}
              width={BAR_MAX_W}
              height="18"
              rx="3"
              fill="none"
              stroke={divider}
              strokeWidth="1"
            />
            <rect
              x={(W - BAR_MAX_W) / 2}
              y={BOT_CY - 9}
              width={barW(curBytes)}
              height="18"
              rx="3"
              fill={curColor}
            />
            <text
              x={W / 2}
              y={BOT_CY + 32}
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
              fill={curColor}
            >
              {Math.round(curBytes).toLocaleString()}B &middot; {curRatio.toFixed(2)}×
            </text>
            <text x={W / 2} y={BOT_CY + 46} textAnchor="middle" fontSize="8" fill={textMuted}>
              {curLabel} (from {preset.raw.toLocaleString()}B raw)
            </text>
          </g>
        )}
      </svg>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontFamily: MONO,
          fontSize: 9,
          color: textMuted,
          marginTop: 4,
        }}
      >
        <span>
          {preset.tokenizer} ({tokInfo.family}, {tokInfo.vocab} tokens)
        </span>
        <span>
          final ANS: {ansRatio.toFixed(2)}× vs LZ4: {lz4Ratio.toFixed(2)}×
        </span>
      </div>
    </div>
  )
}

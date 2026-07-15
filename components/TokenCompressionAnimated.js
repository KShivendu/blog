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
const H_PHASE2 = 340 // wrap: labeled LZ4 / ANS containers
const H_PHASE3 = 340 // shrink: compressed containers + bytes·ratio
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
  const lz4Accent = dark ? '#f59e0b' : '#b45309'
  const lz4Fill = dark ? 'rgba(245,158,11,0.12)' : 'rgba(180,83,9,0.10)'

  const tokInfo = TOKENIZER_INFO[preset.tokenizer]
  const lz4Ratio = preset.raw / preset.lz4
  const ansRatio = preset.raw / preset.ans

  const W = 640
  const H = heightAt(progress)
  const BOX_H = 26
  const BYTE_W = 14,
    BYTE_G = 2
  const bytePreviewFull = [...preset.bytePreview, '…']
  const totalByteW = bytePreviewFull.length * (BYTE_W + BYTE_G) - BYTE_G
  const rowStartX = (W - totalByteW) / 2

  // Byte-hex row for the LZ4 lane. Sized to fit width W across all presets:
  // ASCII presets (~20 bytes) show every byte; Hindi (~43 bytes) is capped at
  // MAX_HEX with a trailing "…". Hex is 2 chars, so cells are narrower than the
  // char cells used in the shared P0 row.
  const HEX_W = 15,
    HEX_G = 2
  const HEX_CELL = HEX_W + HEX_G
  const MAX_HEX = 26
  const hexTrunc = preset.byteHex.length > MAX_HEX
  const hexDisplay = hexTrunc ? [...preset.byteHex.slice(0, MAX_HEX), '…'] : preset.byteHex.slice()
  const totalHexW = hexDisplay.length * HEX_CELL - HEX_G
  const hexStartX = (W - totalHexW) / 2

  const SHARED_Y = 40 // shared raw-byte row, phase 0 only
  const TOP_LABEL_Y = 98
  const TOP_CY = 150 // byte-codec (LZ4) lane
  const DIVIDER_Y = 202
  const BOT_LABEL_Y = 224
  const BOT_CY = 268 // token-path lane

  // Token-ID chips shown in the token lane (post-P0). The token lane is a
  // SEPARATE representation of the same input — pure token IDs, no bytes and no
  // readable glyphs. tokenPreview only decides HOW MANY IDs we have real values
  // for; the chips themselves render just the numeric IDs.
  const idChips = []
  for (let ti = 0; ti < preset.tokenPreview.length; ti++) {
    if (preset.tokenIds[ti] == null) break
    idChips.push({ id: preset.tokenIds[ti] })
  }
  const leftoverTokenCount = preset.tokens - idChips.length

  // Lay the ID chips out in one centered row, widths driven by the ID text so
  // 3 short IDs (English/Python) and 8 longer IDs (Hindi) both fit within W.
  const CHIP_H = 30
  const CHIP_PAD = 14
  const CHIP_GAP = 8
  const CHIP_CHAR_W = 6.3
  const chipLayout = (() => {
    const widths = idChips.map((c) => ('#' + c.id).length * CHIP_CHAR_W + CHIP_PAD)
    const total = widths.reduce((a, w) => a + w, 0) + CHIP_GAP * Math.max(0, idChips.length - 1)
    let cursor = (W - total) / 2
    return idChips.map((c, i) => {
      const x = cursor
      cursor += widths[i] + CHIP_GAP
      return { id: c.id, x, w: widths[i] }
    })
  })()

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
      ? 'wrapping: LZ4 · ANS'
      : 'compressing to output'

  // Compact phase name for the timestamp readout (reuses P0..P3 boundaries).
  const phaseName =
    progress < P0 ? 'bytes' : progress < P1 ? 'match' : progress < P2 ? 'wrap' : 'output'

  // Live byte counts shown under each lane in stage 3. Both stay at raw until
  // P2, then shrink toward each codec's compressed size as stage3T advances.
  const lz4CurBytes = progress < P2 ? preset.raw : lerp(preset.raw, preset.lz4, stage3T)
  const lz4CurRatio = preset.raw / lz4CurBytes
  const tokCurBytes = progress < P2 ? preset.raw : lerp(preset.raw, preset.ans, stage3T)
  const tokCurRatio = preset.raw / tokCurBytes

  // Wrap-container geometry, shared by beat 1 (wrap) and beat 2 (shrink).
  // LZ4 container hugs the byte-hex row; ANS container hugs the ID chips.
  const LZ4_BOX_X = hexStartX - 6
  const LZ4_BOX_FULL_W = totalHexW + 12
  const lastChip = chipLayout[chipLayout.length - 1]
  const chipsLeft = chipLayout.length ? chipLayout[0].x : W / 2
  const chipsRight = lastChip ? lastChip.x + lastChip.w : W / 2
  const ANS_BOX_X = chipsLeft - 8
  const ANS_BOX_FULL_W = chipsRight - chipsLeft + 16

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

      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: textMuted,
          marginBottom: 6,
          letterSpacing: '0.02em',
        }}
      >
        t {progress.toFixed(2)} · {((progress * CYCLE_MS) / 1000).toFixed(1)}s /{' '}
        {(CYCLE_MS / 1000).toFixed(1)}s · {phaseName}
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
              {/* stage 1: sliding-window match search over the raw UTF-8 bytes
                  (shown as hex cells — no readable characters past P0) */}
              {hexDisplay.map((hx, i) => (
                <g key={i}>
                  <rect
                    x={hexStartX + i * HEX_CELL}
                    y={TOP_CY - BOX_H / 2}
                    width={HEX_W}
                    height={BOX_H}
                    rx="2"
                    fill={byteFill}
                    stroke={byteStroke}
                    strokeWidth="0.75"
                  />
                  <text
                    x={hexStartX + i * HEX_CELL + HEX_W / 2}
                    y={TOP_CY + 3}
                    textAnchor="middle"
                    fontSize="7"
                    fontFamily="monospace"
                    fill={byteText}
                  >
                    {hx}
                  </text>
                </g>
              ))}
              {(() => {
                const winBoxes = 5
                const winW = winBoxes * HEX_CELL - HEX_G + 4
                const maxSlide = totalHexW - winW
                const winX = hexStartX - 2 + lerp(0, Math.max(0, maxSlide), stage1T)
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
              {/* beat 1 (wrap + fade): an LZ4 container closes over the byte-hex
                  cells; the raw byte values fade out and the "LZ4" label fades in
                  so you're left with a labeled container, not raw bytes. */}
              {hexDisplay.map((hx, i) => (
                <g key={i} opacity={1 - stage2T}>
                  <rect
                    x={hexStartX + i * HEX_CELL}
                    y={TOP_CY - BOX_H / 2}
                    width={HEX_W}
                    height={BOX_H}
                    rx="2"
                    fill={byteFill}
                    stroke={byteStroke}
                    strokeWidth="0.75"
                  />
                  <text
                    x={hexStartX + i * HEX_CELL + HEX_W / 2}
                    y={TOP_CY + 3}
                    textAnchor="middle"
                    fontSize="7"
                    fontFamily="monospace"
                    fill={byteText}
                  >
                    {hx}
                  </text>
                </g>
              ))}
              <rect
                x={LZ4_BOX_X}
                y={TOP_CY - BOX_H / 2 - 6}
                width={LZ4_BOX_FULL_W}
                height={BOX_H + 12}
                rx="4"
                fill={lz4Fill}
                stroke={lz4Accent}
                strokeWidth="1.5"
                opacity={0.4 + 0.6 * stage2T}
              />
              <text
                x={LZ4_BOX_X + LZ4_BOX_FULL_W / 2}
                y={TOP_CY + 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight="700"
                fill={lz4Accent}
                letterSpacing="0.08em"
                opacity={stage2T}
              >
                LZ4
              </text>
            </>
          )}

          {progress >= P2 && (
            <>
              {/* beat 2 (shrink): the labeled LZ4 container pulls its right edge
                  in to lz4/raw of its wrapped length. */}
              {(() => {
                const w = lerp(LZ4_BOX_FULL_W, LZ4_BOX_FULL_W * (preset.lz4 / preset.raw), stage3T)
                return (
                  <>
                    <rect
                      x={LZ4_BOX_X}
                      y={TOP_CY - BOX_H / 2 - 6}
                      width={w}
                      height={BOX_H + 12}
                      rx="4"
                      fill={lz4Fill}
                      stroke={lz4Accent}
                      strokeWidth="1.5"
                    />
                    <text
                      x={LZ4_BOX_X + w / 2}
                      y={TOP_CY + 4}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="700"
                      fill={lz4Accent}
                      letterSpacing="0.08em"
                    >
                      LZ4
                    </text>
                  </>
                )
              })()}
              <text
                x={W / 2}
                y={TOP_CY + BOX_H / 2 + 20}
                textAnchor="middle"
                fontSize="15"
                fontWeight="700"
                fill={lz4Accent}
              >
                {Math.round(lz4CurBytes).toLocaleString()}B &middot; {lz4CurRatio.toFixed(2)}×
              </text>
              <text
                x={W / 2}
                y={TOP_CY + BOX_H / 2 + 34}
                textAnchor="middle"
                fontSize="8"
                fill={textMuted}
              >
                LZ4 output (from {preset.raw.toLocaleString()}B raw)
              </text>
            </>
          )}
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
            {/* The token lane is its OWN representation of the input: pure token
                IDs. No bytes, no readable glyphs — BPE has already collapsed the
                text into the numeric IDs shown here. */}
            <text
              x={W / 2}
              y={BOT_CY - CHIP_H / 2 - 12}
              textAnchor="middle"
              fontSize="8"
              fill={textMuted}
            >
              BPE merges collapse the text into token IDs
            </text>
            {chipLayout.map((c, i) => {
              const revealAt = i / Math.max(1, chipLayout.length)
              const localT = Math.min(1, Math.max(0, (stage1T - revealAt) * chipLayout.length))
              if (localT <= 0) return null
              const y = BOT_CY - CHIP_H / 2 + (1 - localT) * 8
              return (
                <g key={i} opacity={localT}>
                  <rect
                    x={c.x}
                    y={y}
                    width={c.w}
                    height={CHIP_H}
                    rx="4"
                    fill={tokFill}
                    stroke={tokStroke}
                    strokeWidth="1.25"
                  />
                  <text
                    x={c.x + c.w / 2}
                    y={y + CHIP_H / 2 + 3.5}
                    textAnchor="middle"
                    fontSize="10"
                    fontFamily="monospace"
                    fontWeight="600"
                    fill={tokText}
                  >
                    #{c.id}
                  </text>
                </g>
              )
            })}

            {stage1T > 0.4 && leftoverTokenCount > 0 && (
              <text
                x={W / 2}
                y={BOT_CY + CHIP_H / 2 + 24}
                textAnchor="middle"
                fontSize="8"
                fill={textMuted}
                opacity={Math.min(1, (stage1T - 0.4) * 3)}
              >
                + {leftoverTokenCount.toLocaleString()} more token IDs (rest of the document, not
                shown)
              </text>
            )}
          </g>
        )}

        {progress >= P1 && progress < P2 && (
          <g opacity={splitOpacity}>
            {/* beat 1 (wrap + fade): an ANS container closes over the token-ID
                chips; the ID text fades and the "ANS" label fades in. */}
            <text
              x={W / 2}
              y={BOT_CY - CHIP_H / 2 - 14}
              textAnchor="middle"
              fontSize="10"
              fill={textMuted}
            >
              {preset.tokens.toLocaleString()} tokens
            </text>
            {chipLayout.map((c, i) => (
              <g key={i} opacity={1 - stage2T}>
                <rect
                  x={c.x}
                  y={BOT_CY - CHIP_H / 2}
                  width={c.w}
                  height={CHIP_H}
                  rx="4"
                  fill={tokFill}
                  stroke={tokStroke}
                  strokeWidth="1.25"
                />
                <text
                  x={c.x + c.w / 2}
                  y={BOT_CY + CHIP_H / 2 - 11.5}
                  textAnchor="middle"
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight="600"
                  fill={tokText}
                >
                  #{c.id}
                </text>
              </g>
            ))}
            <rect
              x={ANS_BOX_X}
              y={BOT_CY - CHIP_H / 2 - 6}
              width={ANS_BOX_FULL_W}
              height={CHIP_H + 12}
              rx="4"
              fill={tokFill}
              stroke={tokStroke}
              strokeWidth="1.5"
              opacity={0.4 + 0.6 * stage2T}
            />
            <text
              x={ANS_BOX_X + ANS_BOX_FULL_W / 2}
              y={BOT_CY + 4}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill={tokStroke}
              letterSpacing="0.08em"
              opacity={stage2T}
            >
              ANS
            </text>
          </g>
        )}

        {progress >= P2 && (
          <g opacity={splitOpacity}>
            {/* beat 2 (shrink): the labeled ANS container pulls its right edge in
                to ans/raw of its wrapped length — far more than LZ4. */}
            <text
              x={W / 2}
              y={BOT_CY - CHIP_H / 2 - 14}
              textAnchor="middle"
              fontSize="10"
              fill={textMuted}
            >
              {preset.tokens.toLocaleString()} tokens
            </text>
            {(() => {
              const w = lerp(ANS_BOX_FULL_W, ANS_BOX_FULL_W * (preset.ans / preset.raw), stage3T)
              return (
                <>
                  <rect
                    x={ANS_BOX_X}
                    y={BOT_CY - CHIP_H / 2 - 6}
                    width={w}
                    height={CHIP_H + 12}
                    rx="4"
                    fill={tokFill}
                    stroke={tokStroke}
                    strokeWidth="1.5"
                  />
                  <text
                    x={ANS_BOX_X + w / 2}
                    y={BOT_CY + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="700"
                    fill={tokStroke}
                    letterSpacing="0.08em"
                  >
                    ANS
                  </text>
                </>
              )
            })()}
            <text
              x={W / 2}
              y={BOT_CY + CHIP_H / 2 + 20}
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
              fill={accent}
            >
              {Math.round(tokCurBytes).toLocaleString()}B &middot; {tokCurRatio.toFixed(2)}×
            </text>
            <text
              x={W / 2}
              y={BOT_CY + CHIP_H / 2 + 34}
              textAnchor="middle"
              fontSize="8"
              fill={textMuted}
            >
              ANS output (from {preset.raw.toLocaleString()}B raw)
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

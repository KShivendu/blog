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
    // How the shared character row groups into tokens (char counts, summing to
    // bytePreview.length): "Token"|"-"|"native"|" compres". First groups get IDs.
    tokenGroups: [5, 1, 6, 8],
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
    // "from"|" django"|".apps"|" im"
    tokenGroups: [4, 7, 5, 3],
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
    // "मो"|"हन"|"द"|"ास"|" कर"|"म"|"च"|"न्द " (trailing space folded into last)
    tokenGroups: [2, 2, 1, 2, 3, 1, 1, 4],
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

const CYCLE_MS = 16000 // one full pass (2x slower than before)
const HOLD_MS = 6000 // extra-long pause on the finished frame before looping
const TOTAL_MS = CYCLE_MS + HOLD_MS

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
// Both lanes are on screen from t=0 now (two identical rows that then diverge),
// so the canvas is a constant height for the whole loop.
const H_PHASE0 = 340
const H_PHASE1 = 340
const H_PHASE2 = 340
const H_PHASE3 = 340
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
  const [inView, setInView] = useState(false) // only animate while on screen
  const containerRef = useRef(null)
  const playingRef = useRef(false) // mirrors `playing && inView` for a hard stop in the raf loop
  const rafRef = useRef(null)
  const lastTsRef = useRef(null)
  const clockRef = useRef(0) // ms into the extended cycle (animation + hold)
  const preset = PRESETS[presetIdx]

  // Start the animation only once it scrolls into the viewport (and pause it
  // again when it leaves), so it never runs off-screen.
  useEffect(() => {
    const node = containerRef.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const obs = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.25,
    })
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  const shouldPlay = playing && inView

  useEffect(() => {
    playingRef.current = shouldPlay
  }, [shouldPlay])

  useEffect(() => {
    if (!shouldPlay) return
    const step = (ts) => {
      if (!playingRef.current) return // hard-stop: never advance or reschedule while paused
      if (lastTsRef.current == null) lastTsRef.current = ts
      const dt = ts - lastTsRef.current
      lastTsRef.current = ts
      // Advance an extended clock: the last HOLD_MS of it park on the finished
      // frame (progress pinned at 1) before looping back to 0.
      clockRef.current = (clockRef.current + dt) % TOTAL_MS
      const c = clockRef.current
      setProgress(c < CYCLE_MS ? c / CYCLE_MS : 1)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(rafRef.current)
      lastTsRef.current = null
    }
  }, [shouldPlay])

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
  const CELL_H = 26

  // Both lanes start from the SAME characters. The byte lane then wraps EACH
  // character in its own box (1 byte stays 1 unit, yellow); the token lane
  // wraps ADJACENT characters together into tokens (BPE merges, green).
  const CELL_W = 16
  const CELL_G = 3
  const CELL_STEP = CELL_W + CELL_G
  const GROUP_PAD = 3
  const charCells = preset.bytePreview
  const totalRowW = charCells.length * CELL_STEP - CELL_G
  // Both lanes are LEFT-anchored at the same x (not centered) so that when the
  // containers crush, they shrink toward a shared left edge and the difference
  // in final width is directly comparable. Summary text centers over the row.
  const LEFT_X = 46
  const rowStartX = LEFT_X
  const cellX = (i) => rowStartX + i * CELL_STEP
  const rowMidX = rowStartX + totalRowW / 2

  // Token groupings laid over the same character row. Each group spans `len`
  // adjacent cells; the first groups carry real token IDs, the rest are part
  // of the (much longer) document and aren't drawn.
  const groups = (() => {
    const out = []
    let s = 0
    ;(preset.tokenGroups || []).forEach((len, gi) => {
      const x = cellX(s) - GROUP_PAD
      const right = cellX(s + len - 1) + CELL_W + GROUP_PAD
      out.push({ gi, len, s, x, w: right - x, id: preset.tokenIds[gi] })
      s += len
    })
    return out
  })()
  const idGroupCount = groups.filter((g) => g.id != null).length
  const leftoverTokenCount = preset.tokens - idGroupCount

  // Two stacked rows: byte codec lane (top) and token lane (bottom).
  const TOP_LABEL_Y = 40
  const TOP_CY = 96 // byte-codec (LZ4) lane row
  const DIVIDER_Y = 176
  const BOT_LABEL_Y = 208
  const BOT_CY = 264 // token-path lane row

  const inPhase = (start, end) => Math.max(0, Math.min(1, (progress - start) / (end - start)))
  const bytesT = inPhase(0, P0)
  const stage1T = inPhase(P0, P1)
  const stage2T = inPhase(P1, P2)
  const stage3T = inPhase(P2, P3)
  const labelOpacity = Math.min(1, progress / 0.03)

  // The entropy (LZ4/ANS) phase runs in three beats so the coder "circles" the
  // finished row the same way the grouping boxes were drawn, instead of just
  // popping in:
  //   (a) circle — the container's border draws on around the blocks
  //   (b) fade   — the wrapped blocks fade away, leaving the labeled container
  //   (c) crush  — only now does the container shrink to the output ratio
  const circleT = smoothstep(Math.min(1, stage3T / 0.3))
  const blocksFade = 1 - Math.max(0, Math.min(1, (stage3T - 0.3) / 0.2))
  const crushT = smoothstep(Math.max(0, (stage3T - 0.5) / 0.5))

  // The encode stage runs in two beats: (a) chars dissolve into IDs, then
  // (b) each token box resizes to its fixed byte-width. Byte lane never
  // resizes — a byte is already one byte. Sharp char->ID handoff (the char is
  // gone before the ID arrives) avoids a muddy half-and-half midpoint.
  const dissolveOut = 1 - Math.min(1, stage2T / 0.4)
  const idIn = Math.max(0, Math.min(1, (stage2T - 0.35) / 0.3))
  const resizeT = smoothstep(Math.max(0, (stage2T - 0.55) / 0.45))

  // Per-box "draw-on" progress, cascading left-to-right across stage 1. Each
  // box's outline circles into place over ~0.42 of the stage.
  const byteBoxT = (i) =>
    Math.max(0, Math.min(1, (stage1T - i * (0.55 / Math.max(1, charCells.length))) / 0.42))
  const groupBoxT = (g) =>
    Math.max(0, Math.min(1, (stage1T - g * (0.55 / Math.max(1, groups.length))) / 0.42))

  const phaseLabel =
    progress < P0
      ? 'Same bytes, read two ways (byte codec vs. tokens)'
      : progress < P1
      ? 'bytes: box each byte on its own   ·   tokens: merge adjacent bytes (BPE)'
      : progress < P2
      ? 'chars → IDs; each token shrinks to a fixed 2-byte ID'
      : 'now LZ4 (bytes) and ANS (tokens) entropy-code each path'

  // Compact phase name for the timestamp readout (reuses P0..P3 boundaries).
  const phaseName =
    progress < P0 ? 'copy' : progress < P1 ? 'group' : progress < P2 ? 'encode' : 'entropy'

  // Live byte counts under each lane.
  // Byte lane: raw (bytes only relabel to byte IDs — no compression) until the
  // LZ4 entropy coder kicks in at P2, then raw -> lz4.
  const lz4CurBytes = progress < P2 ? preset.raw : lerp(preset.raw, preset.lz4, crushT)
  const lz4CurRatio = preset.raw / lz4CurBytes
  // Token lane: starts raw, shrinks to `packed` AS the boxes resize during the
  // encode stage (so the number tracks the visible shrink), then ANS trims it
  // further from `packed` to `ans` once entropy coding kicks in at P2.
  const tokCurBytes =
    progress < P2
      ? lerp(preset.raw, preset.packed, resizeT)
      : lerp(preset.packed, preset.ans, crushT)
  const tokCurRatio = preset.raw / tokCurBytes

  // Post-compression, a token is stored as a fixed-width token ID that occupies
  // `bytesPerToken` bytes — so each token box shrinks from its (many) byte-wide
  // char span down to exactly that many BYTE-sized cells, then packs together.
  const tokBytes = tokInfo.bytesPerToken
  const tokBoxW = tokBytes * CELL_W + (tokBytes - 1) * CELL_G
  const PACK_GAP = CELL_G * 2
  const packedTotal = groups.length * tokBoxW + Math.max(0, groups.length - 1) * PACK_GAP
  const packedStartX = LEFT_X
  const packedX = (gi) => packedStartX + gi * (tokBoxW + PACK_GAP)

  // Final phase: the entropy coders wrap each already-tokenized row and shrink
  // to their output ratio — LZ4 over the full byte-ID row, ANS over the packed
  // token-ID row.
  const LZ4_X = rowStartX - 6
  const LZ4_FULL_W = totalRowW + 12
  const ANS_X = packedStartX - 6
  const ANS_FULL_W = packedTotal + 12

  // "Byte ID" shown once a char dissolves in the byte lane: its byte value as
  // two hex digits (schematic — low byte for multi-byte glyphs).
  const byteIdOf = (ch) => (ch.charCodeAt(0) & 0xff).toString(16).toUpperCase().padStart(2, '0')

  // A rectangle whose border "draws on" (circling animation) as t goes 0->1;
  // the fill fades in once the outline is mostly complete.
  const drawRect = (key, { x, y, w, h, rx, stroke, strokeWidth, fill, t }) => {
    const perim = 2 * (w + h)
    return (
      <rect
        key={key}
        x={x}
        y={y}
        width={w}
        height={h}
        rx={rx}
        fill={fill || 'none'}
        fillOpacity={fill ? Math.max(0, (t - 0.55) / 0.45) : 0}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={perim}
        strokeDashoffset={perim * (1 - t)}
        strokeLinecap="round"
      />
    )
  }

  // The shared character row (identical in both lanes), revealed L->R by revealT.
  const charRow = (cy, revealT) =>
    charCells.map((ch, i) => {
      if (revealT < i / charCells.length) return null
      return (
        <g key={'c' + i}>
          <rect
            x={cellX(i)}
            y={cy - CELL_H / 2}
            width={CELL_W}
            height={CELL_H}
            rx="2"
            fill={byteFill}
            stroke={byteStroke}
            strokeWidth="0.75"
          />
          <text
            x={cellX(i) + CELL_W / 2}
            y={cy + 3}
            textAnchor="middle"
            fontSize={ch.length > 1 ? '7' : '8.5'}
            fontFamily="monospace"
            fill={byteText}
          >
            {ch}
          </text>
        </g>
      )
    })

  return (
    <div
      ref={containerRef}
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
          const p = Number(e.target.value) / 1000
          setProgress(p)
          clockRef.current = p * CYCLE_MS // resume continues from the scrubbed spot
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
        aria-label="The same bytes, read two ways: the byte codec boxes each byte on its own while the token path merges adjacent bytes into tokens, then both compress"
      >
        <rect width={W} height={H} rx="2" fill={bg} />

        {/* ── Lane 1: byte codec path (LZ4) ───────────────────────────── */}
        <g opacity={labelOpacity}>
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
        </g>

        {/* P0 + stage 1: the shared character row, then each byte gets its OWN
            yellow box (1 byte stays 1 unit — nothing merges). */}
        {progress < P1 && (
          <>
            {charRow(TOP_CY, progress < P0 ? bytesT : 1)}
            {charCells.map((ch, i) => {
              const t = byteBoxT(i)
              if (t <= 0) return null
              return drawRect('yb' + i, {
                x: cellX(i) - 2,
                y: TOP_CY - CELL_H / 2 - 2,
                w: CELL_W + 4,
                h: CELL_H + 4,
                rx: 3,
                stroke: lz4Accent,
                strokeWidth: 1.5,
                fill: lz4Fill,
                t,
              })
            })}
            {progress >= P0 && (
              <text
                x={rowMidX}
                y={TOP_CY + CELL_H / 2 + 18}
                textAnchor="middle"
                fontSize="8"
                fill={textMuted}
                opacity={Math.min(1, stage1T * 3)}
              >
                each byte kept separate — 1 box = 1 byte
              </text>
            )}
          </>
        )}

        {/* encode: each byte keeps its OWN box at the SAME 1-byte width —
            nothing merges — while the char dissolves and the byte's ID (hex)
            fades in its place. The cells fade out once LZ4 wraps them. */}
        {progress >= P1 && (
          <g opacity={progress < P2 ? 1 : blocksFade}>
            {charCells.map((ch, i) => (
              <g key={'bb' + i}>
                <rect
                  x={cellX(i) - 2}
                  y={TOP_CY - CELL_H / 2 - 2}
                  width={CELL_W + 4}
                  height={CELL_H + 4}
                  rx="3"
                  fill={lz4Fill}
                  stroke={lz4Accent}
                  strokeWidth="1.5"
                />
                <text
                  x={cellX(i) + CELL_W / 2}
                  y={TOP_CY + 3}
                  textAnchor="middle"
                  fontSize="8.5"
                  fontFamily="monospace"
                  fill={byteText}
                  opacity={dissolveOut}
                >
                  {ch}
                </text>
                <text
                  x={cellX(i) + CELL_W / 2}
                  y={TOP_CY + 3}
                  textAnchor="middle"
                  fontSize="7.5"
                  fontFamily="monospace"
                  fontWeight="600"
                  fill={byteText}
                  opacity={idIn}
                >
                  {byteIdOf(ch)}
                </text>
              </g>
            ))}
          </g>
        )}

        {/* entropy: the LZ4 coder circles the byte-ID row (border draws on),
            the blocks fade, then the container crushes to its (modest) output
            ratio — the only compression the byte path gets. */}
        {progress >= P2 &&
          (() => {
            const w = lerp(LZ4_FULL_W, LZ4_FULL_W * (preset.lz4 / preset.raw), crushT)
            return (
              <>
                {drawRect('lz4box', {
                  x: LZ4_X,
                  y: TOP_CY - CELL_H / 2 - 6,
                  w,
                  h: CELL_H + 12,
                  rx: 4,
                  stroke: lz4Accent,
                  strokeWidth: 2,
                  fill: lz4Fill,
                  t: circleT,
                })}
                <text
                  x={LZ4_X + w / 2}
                  y={TOP_CY + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={lz4Accent}
                  letterSpacing="0.08em"
                  opacity={1 - blocksFade}
                >
                  LZ4
                </text>
              </>
            )
          })()}

        {/* bytes · ratio from the wrap phase on. Byte lane stays 1.00× until
            LZ4 actually runs in the shrink. */}
        {progress >= P1 && (
          <>
            <text
              x={rowStartX}
              y={TOP_CY + CELL_H / 2 + 20}
              textAnchor="start"
              fontSize="15"
              fontWeight="700"
              fill={lz4Accent}
            >
              {Math.round(lz4CurBytes).toLocaleString()}B &middot; {lz4CurRatio.toFixed(2)}×
            </text>
            <text
              x={rowStartX}
              y={TOP_CY + CELL_H / 2 + 34}
              textAnchor="start"
              fontSize="8"
              fill={textMuted}
            >
              {progress < P2
                ? 'raw bytes → byte IDs (1:1, no compression yet)'
                : crushT > 0.02
                ? `LZ4 output (from ${preset.raw.toLocaleString()}B raw)`
                : 'LZ4 wraps the byte row…'}
            </text>
          </>
        )}

        <line x1={0} y1={DIVIDER_Y} x2={W} y2={DIVIDER_Y} stroke={divider} strokeWidth="1" />

        {/* ── Lane 2: token path ──────────────────────────────────────── */}
        <g opacity={labelOpacity}>
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

        {/* P0 + stage 1: the SAME character row, but ADJACENT bytes get circled
            together into token boxes (green), collapsing many bytes into one
            token whose ID is shown below. */}
        {progress < P1 && (
          <>
            {charRow(BOT_CY, progress < P0 ? bytesT : 1)}
            {groups.map((grp) => {
              const t = groupBoxT(grp.gi)
              if (t <= 0) return null
              return (
                <g key={'tg' + grp.gi}>
                  {drawRect('gb' + grp.gi, {
                    x: grp.x,
                    y: BOT_CY - CELL_H / 2 - 2,
                    w: grp.w,
                    h: CELL_H + 4,
                    rx: 4,
                    stroke: tokStroke,
                    strokeWidth: 1.75,
                    fill: tokFill,
                    t,
                  })}
                  {grp.id != null && (
                    <text
                      x={grp.x + grp.w / 2}
                      y={BOT_CY + CELL_H / 2 + 14}
                      textAnchor="middle"
                      fontSize="7.5"
                      fontFamily="monospace"
                      fontWeight="600"
                      fill={tokText}
                      opacity={Math.max(0, (t - 0.5) / 0.5)}
                    >
                      #{grp.id}
                    </text>
                  )}
                </g>
              )
            })}
            {progress >= P0 && (
              <text
                x={rowMidX}
                y={BOT_CY + CELL_H / 2 + 30}
                textAnchor="middle"
                fontSize="8"
                fill={textMuted}
                opacity={Math.min(1, stage1T * 3)}
              >
                adjacent bytes merge into {preset.tokens.toLocaleString()} tokens
                {leftoverTokenCount > 0
                  ? ` (+${leftoverTokenCount.toLocaleString()} more, not shown)`
                  : ''}
              </text>
            )}
          </>
        )}

        {/* encode: the chars inside each green token box dissolve, the token ID
            fades in, and then each box resizes to its FIXED byte-width
            (bytesPerToken byte-cells) and packs tight — long tokens compress,
            single-char tokens expand, all to the same small fixed-width ID.
            The boxes fade out once ANS wraps them. */}
        {progress >= P1 && (
          <>
            <text
              x={rowMidX}
              y={BOT_CY - CELL_H / 2 - 14}
              textAnchor="middle"
              fontSize="10"
              fill={textMuted}
            >
              {preset.tokens.toLocaleString()} tokens
            </text>
            {/* chars (in their original per-byte cells) dissolving out */}
            <g opacity={dissolveOut}>{charRow(BOT_CY, 1)}</g>
            <g opacity={progress < P2 ? 1 : blocksFade}>
              {groups.map((grp) => {
                const bx = progress < P2 ? lerp(grp.x, packedX(grp.gi), resizeT) : packedX(grp.gi)
                const bw = progress < P2 ? lerp(grp.w, tokBoxW, resizeT) : tokBoxW
                const cx = bx + bw / 2
                return (
                  <g key={'tb' + grp.gi}>
                    <rect
                      x={bx}
                      y={BOT_CY - CELL_H / 2 - 2}
                      width={bw}
                      height={CELL_H + 4}
                      rx="4"
                      fill={tokFill}
                      stroke={tokStroke}
                      strokeWidth="1.75"
                    />
                    <text
                      x={cx}
                      y={BOT_CY + 3}
                      textAnchor="middle"
                      fontSize="8"
                      fontFamily="monospace"
                      fontWeight="700"
                      fill={tokText}
                      opacity={idIn}
                    >
                      {grp.id != null ? grp.id : '···'}
                    </text>
                  </g>
                )
              })}
            </g>
          </>
        )}

        {/* entropy: the ANS coder circles the packed token-ID row (border draws
            on), the blocks fade, then the container crushes further — the token
            path's second, larger compression win. */}
        {progress >= P2 &&
          (() => {
            // Crush to a width on the SAME raw->pixel scale as LZ4 (bytes) so
            // the two output boxes are directly comparable: more compression =
            // smaller box. (Starts at ANS_FULL_W, which hugs the packed boxes.)
            const w = lerp(ANS_FULL_W, LZ4_FULL_W * (preset.ans / preset.raw), crushT)
            return (
              <>
                {drawRect('ansbox', {
                  x: ANS_X,
                  y: BOT_CY - CELL_H / 2 - 6,
                  w,
                  h: CELL_H + 12,
                  rx: 4,
                  stroke: tokStroke,
                  strokeWidth: 2,
                  fill: tokFill,
                  t: circleT,
                })}
                <text
                  x={ANS_X + w / 2}
                  y={BOT_CY + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={tokStroke}
                  letterSpacing="0.08em"
                  opacity={1 - blocksFade}
                >
                  ANS
                </text>
              </>
            )
          })()}

        {/* bytes · ratio from the wrap phase on — the token lane is ALREADY
            compressed (~packed) before ANS shrinks it further. */}
        {progress >= P1 && (
          <>
            <text
              x={rowStartX}
              y={BOT_CY + CELL_H / 2 + 20}
              textAnchor="start"
              fontSize="15"
              fontWeight="700"
              fill={accent}
            >
              {Math.round(tokCurBytes).toLocaleString()}B &middot; {tokCurRatio.toFixed(2)}×
            </text>
            <text
              x={rowStartX}
              y={BOT_CY + CELL_H / 2 + 34}
              textAnchor="start"
              fontSize="8"
              fill={textMuted}
            >
              {progress < P2
                ? 'tokenize → packed token IDs (before ANS)'
                : crushT > 0.02
                ? `ANS output (from ${preset.raw.toLocaleString()}B raw)`
                : 'ANS wraps the packed IDs…'}
            </text>
          </>
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

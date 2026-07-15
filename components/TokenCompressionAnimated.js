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
  const rowStartX = (W - totalRowW) / 2
  const cellX = (i) => rowStartX + i * CELL_STEP

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
      ? 'wrapping: LZ4 · ANS'
      : 'compressing to output'

  // Compact phase name for the timestamp readout (reuses P0..P3 boundaries).
  const phaseName =
    progress < P0 ? 'copy' : progress < P1 ? 'group' : progress < P2 ? 'wrap' : 'output'

  // Live byte counts shown under each lane in stage 3. Both stay at their
  // pre-shrink size until P2, then shrink toward each codec's output size.
  // Byte lane: raw until LZ4 actually runs (LZ4 doesn't compress until the
  // shrink), then raw -> lz4.
  const lz4CurBytes = progress < P2 ? preset.raw : lerp(preset.raw, preset.lz4, stage3T)
  const lz4CurRatio = preset.raw / lz4CurBytes
  // Token lane is ALREADY compressed by the time we have token IDs (tokenization
  // + packing), so it starts at `packed` (not raw), then ANS shrinks it further.
  const tokCurBytes = progress < P2 ? preset.packed : lerp(preset.packed, preset.ans, stage3T)
  const tokCurRatio = preset.raw / tokCurBytes

  // Wrap containers span the shared character row (both lanes, same width).
  const LZ4_BOX_X = rowStartX - 6
  const LZ4_BOX_FULL_W = totalRowW + 12
  const ANS_BOX_X = rowStartX - 6
  const ANS_BOX_FULL_W = totalRowW + 12

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
                x={W / 2}
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

        {/* stage 2 (wrap): fade the boxed byte row, grow the LZ4 container. */}
        {progress >= P1 && progress < P2 && (
          <>
            <g opacity={1 - stage2T}>
              {charRow(TOP_CY, 1)}
              {charCells.map((ch, i) =>
                drawRect('yb' + i, {
                  x: cellX(i) - 2,
                  y: TOP_CY - CELL_H / 2 - 2,
                  w: CELL_W + 4,
                  h: CELL_H + 4,
                  rx: 3,
                  stroke: lz4Accent,
                  strokeWidth: 1.5,
                  fill: lz4Fill,
                  t: 1,
                })
              )}
            </g>
            <rect
              x={LZ4_BOX_X}
              y={TOP_CY - CELL_H / 2 - 6}
              width={LZ4_BOX_FULL_W}
              height={CELL_H + 12}
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

        {/* stage 3 (shrink): the labeled LZ4 container pulls its right edge in
            to lz4/raw of its wrapped length. */}
        {progress >= P2 &&
          (() => {
            const w = lerp(LZ4_BOX_FULL_W, LZ4_BOX_FULL_W * (preset.lz4 / preset.raw), stage3T)
            return (
              <>
                <rect
                  x={LZ4_BOX_X}
                  y={TOP_CY - CELL_H / 2 - 6}
                  width={w}
                  height={CELL_H + 12}
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

        {/* bytes · ratio from the wrap phase on. Byte lane stays 1.00× until
            LZ4 actually runs in the shrink. */}
        {progress >= P1 && (
          <>
            <text
              x={W / 2}
              y={TOP_CY + CELL_H / 2 + 20}
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
              fill={lz4Accent}
            >
              {Math.round(lz4CurBytes).toLocaleString()}B &middot; {lz4CurRatio.toFixed(2)}×
            </text>
            <text
              x={W / 2}
              y={TOP_CY + CELL_H / 2 + 34}
              textAnchor="middle"
              fontSize="8"
              fill={textMuted}
            >
              {progress < P2
                ? 'raw bytes — LZ4 not run yet'
                : `LZ4 output (from ${preset.raw.toLocaleString()}B raw)`}
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
                x={W / 2}
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

        {/* stage 2 (wrap): fade the boxed token row, grow the ANS container. */}
        {progress >= P1 && progress < P2 && (
          <>
            <text
              x={W / 2}
              y={BOT_CY - CELL_H / 2 - 14}
              textAnchor="middle"
              fontSize="10"
              fill={textMuted}
              opacity={1 - stage2T}
            >
              {preset.tokens.toLocaleString()} tokens
            </text>
            <g opacity={1 - stage2T}>
              {charRow(BOT_CY, 1)}
              {groups.map((grp) =>
                drawRect('gb' + grp.gi, {
                  x: grp.x,
                  y: BOT_CY - CELL_H / 2 - 2,
                  w: grp.w,
                  h: CELL_H + 4,
                  rx: 4,
                  stroke: tokStroke,
                  strokeWidth: 1.75,
                  fill: tokFill,
                  t: 1,
                })
              )}
            </g>
            <rect
              x={ANS_BOX_X}
              y={BOT_CY - CELL_H / 2 - 6}
              width={ANS_BOX_FULL_W}
              height={CELL_H + 12}
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
          </>
        )}

        {/* stage 3 (shrink): the labeled ANS container pulls its right edge in
            to ans/raw — far more than LZ4. */}
        {progress >= P2 && (
          <>
            <text
              x={W / 2}
              y={BOT_CY - CELL_H / 2 - 14}
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
                    y={BOT_CY - CELL_H / 2 - 6}
                    width={w}
                    height={CELL_H + 12}
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
          </>
        )}

        {/* bytes · ratio from the wrap phase on — the token lane is ALREADY
            compressed (~packed) before ANS shrinks it further. */}
        {progress >= P1 && (
          <>
            <text
              x={W / 2}
              y={BOT_CY + CELL_H / 2 + 20}
              textAnchor="middle"
              fontSize="15"
              fontWeight="700"
              fill={accent}
            >
              {Math.round(tokCurBytes).toLocaleString()}B &middot; {tokCurRatio.toFixed(2)}×
            </text>
            <text
              x={W / 2}
              y={BOT_CY + CELL_H / 2 + 34}
              textAnchor="middle"
              fontSize="8"
              fill={textMuted}
            >
              {progress < P2
                ? 'packed token IDs (before ANS)'
                : `ANS output (from ${preset.raw.toLocaleString()}B raw)`}
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

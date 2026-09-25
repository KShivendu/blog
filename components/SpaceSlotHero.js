import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

import DATA from '../data/isbpe-blog.json'
import { LABEL, MONO, labChrome, segButton } from '../lib/wordpiece-lab'

/*
 * Hero for improving-bpe.mdx, built on the TokenCompressionAnimated pattern:
 * one input, two lanes running on the same clock, so you watch the SAME text
 * diverge into two representations instead of comparing two finished rows.
 *
 * Top lane is BPE, where the space is absorbed into the word that follows.
 * Bottom lane is ISBPE, where the space evaporates and a mark appears only
 * where a space is missing. They stay in lockstep until phase 2, which is the
 * moment the schemes actually differ.
 *
 * Two earlier versions of this file failed and both are worth recording. The
 * first animated three disconnected beats on `self.fireEvent(name)`, a string
 * with no spaces in it, so a hero about storing the space showed none. The
 * second fixed the example and then toggled discrete state, which reads as a
 * slideshow rather than as an event.
 *
 * Pieces come from the real trained vocabularies via tokenizer/exp89_blog_data.py.
 * `get_attraction` runs on the English vocabulary on purpose: on the code one
 * the word is absent and dual-flag gives `get #_# att #raction`.
 */

// Phase boundaries as fractions of the cycle. Both lanes use the same ones, so
// the divergence at P1 is simultaneous and therefore legible as a divergence.
const P0 = 0.16 // shared: the raw text
const P1 = 0.42 // shared: cut into pretokens, both lanes still identical
const P2 = 0.72 // DIVERGE: BPE swallows the space, ISBPE drops it and marks
const P3 = 1.0 // the vocabulary slots each scheme ends up needing

const CYCLE_MS = 9000
const HOLD_MS = 4200
const TOTAL_MS = CYCLE_MS + HOLD_MS

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t))
const smoothstep = (t) => {
  const c = Math.max(0, Math.min(1, t))
  return c * c * (3 - 2 * c)
}
const inPhase = (p, from, to) => smoothstep((p - from) / (to - from))

export default function SpaceSlotHero() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const c = labChrome(dark)

  const heroes = DATA.hero
  const [pick, setPick] = useState(0)
  const [progress, setProgress] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [inView, setInView] = useState(false)
  const [narrow, setNarrow] = useState(false)

  const boxRef = useRef(null)
  const rafRef = useRef(null)
  const lastRef = useRef(null)
  const clockRef = useRef(0)
  const liveRef = useRef(false)
  liveRef.current = playing && inView

  // Only animate on screen, and measure real width so phones get smaller type
  // rather than the same design scaled until it is unreadable.
  useEffect(() => {
    const el = boxRef.current
    if (!el) return undefined
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), {
      threshold: 0.2,
    })
    io.observe(el)
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 520))
    ro.observe(el)
    return () => {
      io.disconnect()
      ro.disconnect()
    }
  }, [])

  useEffect(() => {
    const step = (ts) => {
      if (lastRef.current == null) lastRef.current = ts
      const dt = ts - lastRef.current
      lastRef.current = ts
      if (liveRef.current) {
        clockRef.current = (clockRef.current + dt) % TOTAL_MS
        setProgress(Math.min(1, clockRef.current / CYCLE_MS))
      }
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const h = heroes[pick]
  const p = progress
  const green = c.channel[0]
  const red = c.bad

  // The duplicate is the point: one surface word BPE holds in two slots.
  const dup = (() => {
    const bare = new Set(h.bpe_slots.filter((s) => !s.s.startsWith(' ')).map((s) => s.s.trim()))
    const hit = h.bpe_slots.find((s) => s.s.startsWith(' ') && bare.has(s.s.trim()))
    return hit ? hit.s.trim() : null
  })()

  const FS = narrow ? 11 : 13
  const CH = FS * 0.62
  const PAD = narrow ? 5 : 7
  const GAP = 5
  const ROW = narrow ? 30 : 34

  const chipW = (txt) => txt.length * CH + PAD * 2
  const layout = (pieces, render) => {
    let x = 0
    return pieces.map((pc) => {
      const txt = render(pc)
      const w = chipW(txt)
      const at = x
      x += w + GAP
      return { ...pc, txt, x: at, w }
    })
  }

  // Lane content per phase. Before P2 both lanes show the same pretokens, which
  // is what makes the split at P2 read as the schemes diverging.
  const shared = layout(h.bpe, (pc) => pc.s.replace(/ /g, '·'))
  const bpeRow = shared
  const isbRow = layout(h.isbpe, (pc) => (pc.l ? '#' : '') + pc.s + (pc.r ? '#' : ''))
  const bpeSlots = layout(h.bpe_slots, (pc) => pc.s.replace(/ /g, '·'))
  const isbSlots = layout(h.isbpe_slots, (pc) => (pc.l ? '#' : '') + pc.s + (pc.r ? '#' : ''))

  const tText = inPhase(p, 0, P0)
  const tCut = inPhase(p, P0, P1)
  const tSplit = inPhase(p, P1, P2)
  const tSlots = inPhase(p, P2, P3)

  const W = Math.max(
    360,
    ...[bpeRow, isbRow, bpeSlots, isbSlots].map((r) =>
      r.length ? r[r.length - 1].x + r[r.length - 1].w : 0
    )
  )
  const LANE_X = narrow ? 0 : 62
  const VB_W = W + LANE_X + 56
  const VB_H = ROW * 4 + (narrow ? 74 : 58)

  const Chip = ({ d, y, tint, o = 1, dim }) => (
    <g opacity={o} style={{ transition: 'none' }}>
      <rect
        x={d.x}
        y={y}
        width={d.w}
        height={ROW - 10}
        rx={2}
        fill={tint ? (dark ? `${tint}28` : `${tint}18`) : c.fill}
        stroke={tint || c.border}
        strokeWidth={1}
        opacity={dim ? 0.55 : 1}
      />
      <text
        x={d.x + d.w / 2}
        y={y + (ROW - 10) / 2 + FS * 0.36}
        textAnchor="middle"
        fontFamily={MONO}
        fontSize={FS}
        fill={tint || c.ink}
        opacity={dim ? 0.75 : 1}
      >
        {d.txt}
      </text>
    </g>
  )

  const laneLabel = (y, text, tint) =>
    narrow ? null : (
      <text x={0} y={y + (ROW - 10) / 2 + 3} fontFamily={MONO} fontSize={10} fill={tint}>
        {text}
      </text>
    )

  const yBPE = narrow ? 34 : 30
  const ySlotB = yBPE + ROW
  const yISB = ySlotB + ROW + (narrow ? 12 : 10)
  const ySlotI = yISB + ROW

  const phaseText =
    p < P0
      ? 'one line of text'
      : p < P1
      ? 'cut into pretokens, identical so far'
      : p < P2
      ? 'BPE swallows the space. ISBPE drops it and marks only where one is missing'
      : 'and here is what each scheme has to store'

  return (
    <div
      ref={boxRef}
      data-widget="space-slot-hero"
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 3,
        padding: narrow ? '12px 12px 10px' : '16px 18px 14px',
        margin: '28px 0',
        background: c.lane,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {heroes.map((x, i) => (
            <button
              key={x.text}
              onClick={() => {
                setPick(i)
                clockRef.current = 0
                setProgress(0)
              }}
              style={segButton(c, i === pick)}
            >
              {x.text}
            </button>
          ))}
        </div>
        <button onClick={() => setPlaying((v) => !v)} style={{ ...segButton(c, false) }}>
          {playing ? 'pause' : 'play'}
        </button>
      </div>

      <div style={{ ...LABEL, color: c.muted, minHeight: 15, marginBottom: 4 }}>{phaseText}</div>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" role="img" aria-label={phaseText}>
        <g transform={`translate(${LANE_X},0)`}>
          {/* the raw line, fading out as the pretokens appear */}
          <text
            x={0}
            y={16}
            fontFamily={MONO}
            fontSize={FS}
            fill={c.muted}
            opacity={1 - tCut * 0.75}
          >
            {h.text}
          </text>

          {/* BPE lane */}
          {laneLabel(yBPE, 'BPE', red)}
          {bpeRow.map((d, i) => (
            <Chip
              key={`b${i}`}
              d={d}
              y={yBPE}
              o={tCut}
              tint={dup && d.s.trim() === dup && tSplit > 0.5 ? red : undefined}
            />
          ))}

          {/* BPE slots, revealed last */}
          {laneLabel(ySlotB, 'slots', c.muted)}
          {bpeSlots.map((d, i) => (
            <Chip
              key={`bs${i}`}
              d={d}
              y={ySlotB}
              o={tSlots}
              dim
              tint={dup && d.s.trim() === dup ? red : undefined}
            />
          ))}
          <text
            x={(bpeSlots.at(-1)?.x ?? 0) + (bpeSlots.at(-1)?.w ?? 0) + 10}
            y={ySlotB + (ROW - 10) / 2 + FS * 0.36}
            fontFamily={MONO}
            fontSize={FS + 1}
            fontWeight="700"
            fill={red}
            opacity={tSlots}
          >
            {h.bpe_slots.length}
          </text>

          {/* ISBPE lane */}
          {laneLabel(yISB, 'ISBPE', green)}
          {(tSplit > 0 ? isbRow : bpeRow).map((d, i) => (
            <Chip
              key={`i${i}`}
              d={d}
              y={yISB}
              o={tCut}
              tint={
                tSplit > 0.5 && (d.txt.includes('#') || (dup && d.s.trim() === dup))
                  ? green
                  : undefined
              }
            />
          ))}

          {laneLabel(ySlotI, 'slots', c.muted)}
          {isbSlots.map((d, i) => (
            <Chip key={`is${i}`} d={d} y={ySlotI} o={tSlots} dim tint={green} />
          ))}
          <text
            x={(isbSlots.at(-1)?.x ?? 0) + (isbSlots.at(-1)?.w ?? 0) + 10}
            y={ySlotI + (ROW - 10) / 2 + FS * 0.36}
            fontFamily={MONO}
            fontSize={FS + 1}
            fontWeight="700"
            fill={green}
            opacity={tSlots}
          >
            {h.isbpe_slots.length}
          </text>
        </g>
      </svg>

      {/* Scrubbable, not just a readout. A reader can stop on the split and
          look at it, and scripts/record-widget.js drives this same input to
          step the animation frame by frame for capture. */}
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(p * 1000)}
        onChange={(e) => {
          setPlaying(false)
          const v = Number(e.target.value) / 1000
          clockRef.current = v * CYCLE_MS
          setProgress(v)
        }}
        aria-label="animation progress"
        style={{ width: '100%', margin: '4px 0 8px', accentColor: green, height: 3 }}
      />

      <div style={{ fontSize: 12.5, color: c.ink, lineHeight: 1.65 }}>
        <span style={{ color: c.muted }}>{h.note}.</span>{' '}
        {dup ? (
          <>
            BPE needs a slot for <code style={{ fontFamily: MONO }}>{dup}</code> and another for{' '}
            <code style={{ fontFamily: MONO, color: red }}>·{dup}</code>.{' '}
          </>
        ) : null}
        Across a real vocabulary that is{' '}
        <b style={{ color: red }}>{DATA.slots.pairs.toLocaleString()}</b> words held in both forms,{' '}
        <b style={{ color: red }}>{DATA.slots.share}%</b> of all {DATA.slots.vocab.toLocaleString()}{' '}
        slots, on 20 MB of Python.
      </div>
    </div>
  )
}

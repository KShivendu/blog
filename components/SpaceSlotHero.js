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
 * It shows only the post's running example, `self.items = items or self.items`, so the
 * hero and the method section agree.
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
  const [boxW, setBoxW] = useState(0)

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
    const ro = new ResizeObserver(([e]) => {
      setNarrow(e.contentRect.width < 520)
      setBoxW(e.contentRect.width)
    })
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
  // BPE is red in every widget and chart of the post, ISBPE green.
  const red = c.bad

  // The duplicate is the point: one surface word BPE holds in two slots.
  // The leading space arrives as U+00B7 from bpe_pieces(), not as a space, so
  // strip both. Testing startsWith(' ') matched nothing and the duplicate was
  // never highlighted, which is the one thing this widget exists to show.
  const core = (str) => str.replace(/^[ \u00b7]+/, '')
  // Every word BPE holds in two slots on this line, bare and with the space.
  // The data lists them; otherwise find them from the slots.
  const dups = new Set(
    h.dup ||
      h.bpe_slots
        .filter((x) => x.s !== core(x.s))
        .map((x) => core(x.s))
        .filter((w) => h.bpe_slots.some((y) => y.s === w))
  )

  // On a phone the viewBox matches the real width (one unit, one pixel), so 13
  // is 13px on screen, and the chips wrap onto a second line instead of the
  // whole drawing shrinking until the text is 5px tall.
  const FS = 13
  const CH = FS * 0.62
  const PAD = narrow ? 5 : 7
  const GAP = 5
  const ROW = narrow ? 30 : 34
  const LINE = ROW - 4 // vertical step between wrapped chip lines
  const NARROW_W = Math.max(240, Math.floor(boxW) || 300)

  const chipW = (txt) => txt.length * CH + PAD * 2
  const layout = (pieces, render) => {
    const maxW = narrow ? NARROW_W - 8 : Infinity // slack for glyphs wider than CH
    let x = 0
    let line = 0
    return pieces.map((pc) => {
      const txt = render(pc)
      const w = chipW(txt)
      if (x > 0 && x + w > maxW) {
        x = 0
        line += 1
      }
      const at = x
      x += w + GAP
      return { ...pc, txt, x: at, w, line }
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
  const lines = (r) => (r.length ? r[r.length - 1].line + 1 : 1)

  // Two rows, not four. For this example BPE's token row and slot row are
  // identical (6 and 6), so showing both read as an accidental duplicate. The
  // distinct-slot count goes inline at the end of each row instead. On a phone
  // each lane gets its label on its own line above the chips.
  const LABEL_H = 22
  const yBPE = narrow ? 18 + LABEL_H : 26
  const yISB = narrow
    ? yBPE + (lines(bpeRow) - 1) * LINE + (ROW - 10) + 8 + LABEL_H
    : yBPE + ROW + 8
  const isbLines = Math.max(lines(bpeRow), lines(isbRow))
  const VB_W = narrow ? NARROW_W : W + LANE_X + 96 // room for the "7 slots" count
  const VB_H = narrow ? yISB + (isbLines - 1) * LINE + (ROW - 10) + 4 : ROW * 2 + 26

  const Chip = ({ d, y, tint, wash, stub = red, o = 1, dim }) => {
    // The leading space is drawn as a filled slab rather than a glyph, so it
    // reads as width the token took rather than as punctuation.
    const lead = d.txt.startsWith('\u00b7')
    const body = lead ? d.txt.slice(1) : d.txt
    const slabW = CH + PAD * 0.6
    return (
      <g opacity={o}>
        <rect
          x={d.x}
          y={y}
          width={d.w}
          height={ROW - 10}
          rx={2}
          fill={tint ? (dark ? `${tint}28` : `${tint}18`) : wash ? `${wash}14` : c.fill}
          stroke={tint || c.border}
          strokeWidth={1}
          opacity={dim ? 0.55 : 1}
        />
        {lead ? (
          <>
            <rect
              x={d.x + 1}
              y={y + 1}
              width={slabW}
              height={ROW - 12}
              rx={1}
              fill={stub}
              opacity={dim ? 0.3 : 0.55}
            />
            <line
              x1={d.x + 1 + slabW}
              y1={y + 1}
              x2={d.x + 1 + slabW}
              y2={y + ROW - 11}
              stroke={stub}
              strokeWidth={1}
              opacity={0.75}
            />
          </>
        ) : null}
        <text
          x={d.x + (lead ? slabW + 1 : 0) + (d.w - (lead ? slabW + 1 : 0)) / 2}
          y={y + (ROW - 10) / 2 + FS * 0.36}
          textAnchor="middle"
          fontFamily={MONO}
          fontSize={FS}
          fill={tint || c.ink}
          opacity={dim ? 0.75 : 1}
        >
          {body}
        </text>
      </g>
    )
  }

  // Drawn OUTSIDE the translated group, so it can never sit under a chip.
  const Count = ({ x, y, n, tint, o }) => (
    <g opacity={o}>
      <text
        x={x}
        y={y + (ROW - 10) / 2 + FS * 0.36}
        fontFamily={MONO}
        fontSize={FS + 2}
        fontWeight="700"
        fill={tint}
      >
        {n}
      </text>
      <text
        x={x + (FS + 2) * 0.62 + 5}
        y={y + (ROW - 10) / 2 + FS * 0.36}
        fontFamily={MONO}
        fontSize={FS - 2}
        fill={c.muted}
      >
        slots
      </text>
    </g>
  )

  const laneLabel = (y, text, tint) =>
    narrow ? (
      <text x={0} y={y - 7} fontFamily={MONO} fontSize={11} fontWeight="700" fill={tint}>
        {text}
      </text>
    ) : (
      <text
        x={LANE_X - 10}
        y={y + (ROW - 10) / 2 + 3}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={10}
        fill={tint}
      >
        {text}
      </text>
    )

  // Where the "7 slots" count goes: after the last chip on a wide screen, next
  // to the lane label on a phone.
  const countAt = (row, y) =>
    narrow
      ? { x: 52, y: y - 7 - ((ROW - 10) / 2 + FS * 0.36) }
      : { x: (row.at(-1)?.x ?? 0) + (row.at(-1)?.w ?? 0) + 12, y }

  // A space-separated example never produces a mark, so the phase text must
  // not promise one.
  const hasMarks = h.isbpe.some((x) => x.l || x.r)
  const phaseText =
    p < P0
      ? 'one line of text'
      : p < P1
      ? 'cut into pretokens, identical so far'
      : p < P2
      ? hasMarks
        ? 'BPE swallows the space. ISBPE drops it and marks where one is missing'
        : 'BPE swallows the space. ISBPE just drops it'
      : 'the distinct slots each scheme has to store'

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
          {heroes.length === 1 ? (
            <span style={{ ...LABEL, color: c.muted, alignSelf: 'center' }}>python</span>
          ) : null}
          {heroes.length > 1 &&
            heroes.map((x, i) => (
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
      <div style={{ fontFamily: MONO, fontSize: 11, color: c.muted, marginBottom: 4 }}>
        <span style={{ color: red }}>red</span> = BPE, <span style={{ color: green }}>green</span> =
        ISBPE
      </div>

      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" role="img" aria-label={phaseText}>
        {/* Labels live outside the chip group so they can never be covered. */}
        {laneLabel(yBPE, 'BPE', red)}
        {laneLabel(yISB, 'ISBPE', green)}

        <g transform={`translate(${LANE_X},0)`}>
          {/* the raw line, fading as the pretokens take over */}
          <text
            x={0}
            y={14}
            fontFamily={MONO}
            fontSize={FS}
            fill={c.muted}
            opacity={1 - tCut * 0.8}
          >
            {h.text}
          </text>

          {/* BPE: the space is glued on, so the repeated word needs two slots */}
          {bpeRow.map((d, i) => (
            <Chip
              key={`b${i}`}
              d={d}
              y={yBPE + d.line * LINE}
              o={tCut}
              tint={dups.has(core(d.s)) ? red : undefined}
            />
          ))}
          <Count {...countAt(bpeRow, yBPE)} n={h.bpe_slots.length} tint={red} o={tSlots} />

          {/* ISBPE: identical to BPE until P1, then the spaces leave. Its space
              stubs are grey, never red: red means BPE in this post. After the
              split every chip takes a green wash, and the words BPE doubled
              take full green. */}
          {(tSplit > 0 ? isbRow : bpeRow).map((d, i) => (
            <Chip
              key={`i${i}`}
              d={d}
              y={yISB + d.line * LINE}
              o={tCut}
              stub={c.off}
              wash={tSplit > 0 ? green : undefined}
              tint={tSplit > 0.4 && dups.has(core(d.s)) ? green : undefined}
            />
          ))}
          <Count {...countAt(isbRow, yISB)} n={h.isbpe_slots.length} tint={green} o={tSlots} />
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
        <span style={{ color: c.muted }}>{h.note}.</span> Across a real vocabulary that is{' '}
        <b style={{ color: red }}>{DATA.slots.pairs.toLocaleString('en-US')}</b> strings held in
        both forms, <b style={{ color: red }}>{DATA.slots.share}%</b> of all{' '}
        {DATA.slots.vocab.toLocaleString('en-US')} slots, on 20 MB of Python.
      </div>
    </div>
  )
}

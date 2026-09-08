import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

// Two-lane hero for "stemming is query expansion from the other side":
//   TOP    — stem the index: fold every surface form into one term at build
//            time (destructive; the query is stemmed too).
//   BOTTOM — expand the query: leave the index untouched, fan the query word
//            into its family, weight each variant, take the max.
// Cycles race / high / dietary. On `race` both lanes reach the same four
// forms (Porter merges them). On `high` and `dietary` Porter can't merge the
// family at all, so the top lane misses forms the bottom lane's learned pairs
// still reach — previewing why the query side goes further than the stemmer.
//
// Visual language is deliberately borrowed from TokenSearchAnalyzer /
// TokenCompressionAnimated: warm-grey Teletype palette, Fira Code mono, ~2px
// corners, hairline borders, one theme-aware brand green as the only accent.
// Baseline / rewritten = neutral grey; reached-by-expansion + learned = green.

const CASES = [
  {
    word: 'race',
    forms: ['race', 'racing', 'raced', 'races'],
    stemMerges: true, // Porter stems all four to `race`
    topReached: ['race', 'racing', 'raced', 'races'],
    expand: [
      { t: 'race', w: 1.0 },
      { t: 'racing', w: 0.64 },
      { t: 'races', w: 0.42 },
      { t: 'raced', w: 0.13 },
    ],
    verdict: 'tie',
    note: 'Porter folds all four into `race`. Expansion fans the query into the same four, weighted, and keeps the best match. Same documents, opposite sides.',
  },
  {
    word: 'high',
    forms: ['high', 'higher', 'highest'],
    stemMerges: false, // high / higher / highest each stem to themselves
    topReached: ['high'],
    expand: [
      { t: 'high', w: 1.0 },
      { t: 'higher', w: 0.59, learned: true },
      { t: 'highest', w: 0.41, learned: true },
    ],
    verdict: 'expand',
    note: 'Porter stems `high`, `higher` and `highest` to themselves, so it never merges them. A learned pair reaches the two it misses.',
  },
  {
    word: 'dietary',
    forms: ['dietary', 'diet', 'diets', 'dieting'],
    stemMerges: false, // dietary -> dietari, diet -> diet: kept apart
    topReached: ['dietary'],
    expand: [
      { t: 'dietary', w: 1.0 },
      { t: 'diet', w: 0.73, learned: true },
      { t: 'diets', w: 0.37, learned: true },
      { t: 'dieting', w: 0.04, learned: true },
    ],
    verdict: 'expand',
    note: 'Porter stems `dietary` to `dietari` but `diet` to `diet`, so it keeps them apart. A learned pair links the whole family.',
  },
]

const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
const TEXT = `${MONO}, sans-serif`

export default function StemExpandHero() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark' // avoid SSR/client hydration mismatch
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const ref = useRef(null)

  // auto-advance through the words unless hovered/focused
  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setI((x) => (x + 1) % CASES.length), 4600)
    return () => clearInterval(t)
  }, [paused])

  const C = CASES[i]
  const tie = C.verdict === 'tie'

  // Palette mirrors the site charts / other heroes so this reads as a sibling.
  const c = dark
    ? {
        card: '#0d1310',
        border: '#1e2822',
        ink: '#dde6e0',
        muted: '#8a968e',
        axis: '#38473e',
        accent: '#34d399',
        accentInk: '#08110c',
        neutralFill: 'rgba(255,255,255,0.04)',
        tokFill: 'rgba(52,211,153,0.12)',
        tokText: '#6ee7b7',
        churn: '#f0a3a3',
        churnFill: 'rgba(240,163,163,0.08)',
        laneBg: 'rgba(255,255,255,0.015)',
      }
    : {
        card: '#ffffff',
        border: '#e0e4e1',
        ink: '#14161a',
        muted: '#5f6570',
        axis: '#c8cfc9',
        accent: '#047857',
        accentInk: '#ffffff',
        neutralFill: '#f0f2f0',
        tokFill: 'rgba(4,120,87,0.09)',
        tokText: '#065f46',
        churn: '#c2410c',
        churnFill: 'rgba(194,65,15,0.06)',
        laneBg: '#fbfcfb',
      }

  const arrow = { color: c.axis, fontSize: 13, flex: '0 0 auto', userSelect: 'none' }
  const laneLabel = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    fontFamily: MONO,
  }
  const mech = {
    padding: '5px 10px',
    borderRadius: 2,
    fontSize: 12,
    fontWeight: 600,
    background: c.neutralFill,
    color: c.muted,
    border: `1px solid ${c.axis}`,
    whiteSpace: 'nowrap',
    fontFamily: MONO,
  }
  const queryChip = {
    padding: '4px 9px',
    borderRadius: 2,
    fontSize: 12.5,
    background: c.neutralFill,
    color: c.ink,
    border: `1px solid ${c.axis}`,
    whiteSpace: 'nowrap',
    fontFamily: TEXT,
    fontWeight: 600,
  }
  // A surface-form chip. reached=false → greyed + struck (the stemmer misses it).
  // learned → green treatment. weight → shown as a faded tabular suffix.
  const form = ({ reached, learned, weight }) => ({
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 5,
    padding: '4px 9px',
    borderRadius: 2,
    fontSize: 12.5,
    fontFamily: TEXT,
    whiteSpace: 'nowrap',
    background: !reached ? 'transparent' : learned ? c.tokFill : c.neutralFill,
    color: !reached ? c.muted : learned ? c.tokText : c.ink,
    border: `1px solid ${!reached ? c.border : learned ? c.accent : c.axis}`,
    textDecoration: reached ? 'none' : 'line-through',
    opacity: reached ? 1 : 0.55,
  })
  const wt = { fontSize: 10.5, opacity: 0.7, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }

  const Lane = ({ side }) => {
    const isTop = side === 'top'
    const reachedSet = isTop ? C.topReached : C.forms
    return (
      <div
        style={{
          background: isTop ? c.laneBg : c.tokFill,
          border: `1px solid ${isTop ? c.border : c.accent}`,
          borderRadius: 2,
          padding: '10px 12px',
          marginBottom: isTop ? 8 : 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ ...laneLabel, color: isTop ? c.muted : c.accent }}>
            {isTop ? 'Stem the index · build time' : 'Expand the query · search time'}
          </span>
          <span
            style={{
              ...laneLabel,
              letterSpacing: '0.03em',
              color: isTop ? c.churn : c.accent,
            }}
          >
            {isTop ? 'index rewritten' : 'index untouched'}
          </span>
        </div>
        <div className="seh-lane seh-flow" key={`${side}-${i}`}>
          <span style={queryChip}>{C.word}</span>
          <span style={arrow}>→</span>
          <span
            style={
              isTop
                ? mech
                : {
                    ...mech,
                    color: c.tokText,
                    background: c.tokFill,
                    border: `1px solid ${c.accent}`,
                    fontWeight: 700,
                  }
            }
          >
            {isTop ? 'Porter stem' : `expand ×${C.expand.length} · max`}
          </span>
          <span style={arrow}>→</span>
          {isTop
            ? C.forms.map((f) => (
                <span key={f} style={form({ reached: reachedSet.includes(f) })}>
                  {f}
                </span>
              ))
            : C.expand.map((e) => (
                <span key={e.t} style={form({ reached: true, learned: e.learned })}>
                  {e.t}
                  <span style={wt}>{e.w.toFixed(2)}</span>
                </span>
              ))}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={ref}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        background: c.card,
        border: `1px solid ${c.border}`,
        borderRadius: 2,
        padding: 'clamp(12px, 3vw, 16px)',
        margin: '1.5rem 0',
        color: c.ink,
        fontFamily: MONO,
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .seh-flow > * { animation: sehIn .45s ease both; }
        @keyframes sehIn { from { opacity:0; transform: translateX(-6px) } to { opacity:1; transform:none } }
        .seh-lane { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        @media (max-width: 600px) { .seh-lane { gap:6px 7px; } }
        @media (prefers-reduced-motion: reduce) { .seh-flow > * { animation: none !important; } }
      `,
        }}
      />

      {/* header: word tabs + shared framing */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex' }}>
          {CASES.map((cse, k) => {
            const on = k === i
            return (
              <button
                key={cse.word}
                type="button"
                onClick={() => setI(k)}
                aria-pressed={on}
                style={{
                  appearance: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  lineHeight: 1,
                  padding: '6px 12px',
                  border: `1px solid ${on ? c.accent : c.border}`,
                  marginLeft: k === 0 ? 0 : '-1px',
                  background: on ? c.accent : 'transparent',
                  color: on ? c.accentInk : c.muted,
                  fontFamily: TEXT,
                  fontWeight: on ? 600 : 400,
                  zIndex: on ? 1 : 0,
                  position: 'relative',
                  borderRadius: 2,
                  transition: 'background .15s, color .15s, border-color .15s',
                }}
              >
                {cse.word}
              </button>
            )
          })}
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: c.muted,
          }}
        >
          same word family, two sides
        </span>
      </div>

      <Lane side="top" />
      <Lane side="bottom" />

      {/* punchline */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            padding: '4px 9px',
            borderRadius: 2,
            fontSize: 11.5,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: MONO,
            background: tie ? c.neutralFill : c.tokFill,
            color: tie ? c.muted : c.tokText,
            border: `1px solid ${tie ? c.axis : c.accent}`,
            whiteSpace: 'nowrap',
          }}
        >
          {tie
            ? 'same matches · opposite sides'
            : `expansion reaches ${C.forms.length - C.topReached.length} forms Porter can't`}
        </span>
        <span style={{ fontSize: 12.5, color: c.muted, fontFamily: TEXT, lineHeight: 1.45 }}>
          {C.note}
        </span>
      </div>
    </div>
  )
}

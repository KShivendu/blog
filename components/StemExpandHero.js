import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

// Two-lane hero for "stemming is query expansion from the other side":
//   TOP    — stem the index: fold every surface form into one term (destructive).
//   BOTTOM — expand the query: leave the index alone, fan the query into its
//            family, weight each variant, take the max.
// Cycles race / high / dietary. `stemMerges` is the one thing that varies: when
// Porter folds the whole family into one stem (race), both lanes reach the same
// forms. When it can't (high, dietary), only the query word survives stemming,
// so the top lane greys out the extra forms that the bottom lane's learned
// pairs still reach — the reason the query side goes further than the stemmer.
//
// Visual language borrowed from TokenSearchAnalyzer: warm-grey Teletype palette,
// mono, hairline borders, one theme-aware brand green as the only accent.

const CASES = [
  {
    word: 'race',
    forms: ['race', 'racing', 'raced', 'races'],
    stemMerges: true,
    expand: [
      { t: 'race', w: 1.0 },
      { t: 'racing', w: 0.64 },
      { t: 'races', w: 0.42 },
      { t: 'raced', w: 0.13 },
    ],
    note: 'Porter folds all four into `race`. Expansion fans the query into the same four, weighted, and keeps the best match. Same documents, opposite sides.',
  },
  {
    word: 'high',
    forms: ['high', 'higher', 'highest'],
    stemMerges: false,
    expand: [
      { t: 'high', w: 1.0 },
      { t: 'higher', w: 0.59 },
      { t: 'highest', w: 0.41 },
    ],
    note: 'Porter stems `high`, `higher` and `highest` to themselves, so it never merges them. A learned pair reaches the two it misses.',
  },
  {
    word: 'dietary',
    forms: ['dietary', 'diet', 'diets', 'dieting'],
    stemMerges: false,
    expand: [
      { t: 'dietary', w: 1.0 },
      { t: 'diet', w: 0.73 },
      { t: 'diets', w: 0.37 },
      { t: 'dieting', w: 0.04 },
    ],
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

  // auto-advance through the words unless hovered
  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setI((x) => (x + 1) % CASES.length), 4600)
    return () => clearInterval(t)
  }, [paused])

  const C = CASES[i]
  const tie = C.stemMerges // race: both lanes reach the same forms
  // forms the query reaches after stemming: the whole family if Porter merges
  // it, otherwise just the query word itself.
  const topReached = C.stemMerges ? C.forms : [C.word]

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
  const chip = {
    padding: '4px 9px',
    borderRadius: 2,
    fontSize: 12.5,
    fontFamily: TEXT,
    whiteSpace: 'nowrap',
  }
  const mech = (green) => ({
    ...chip,
    fontFamily: MONO,
    fontWeight: green ? 700 : 600,
    color: green ? c.tokText : c.muted,
    background: green ? c.tokFill : c.neutralFill,
    border: `1px solid ${green ? c.accent : c.axis}`,
  })
  // A surface-form chip. reached=false → greyed + struck (the stemmer misses it).
  // learned → green treatment (a pair no suffix rule reaches).
  const form = (reached, learned) => ({
    ...chip,
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 5,
    background: !reached ? 'transparent' : learned ? c.tokFill : c.neutralFill,
    color: !reached ? c.muted : learned ? c.tokText : c.ink,
    border: `1px solid ${!reached ? c.border : learned ? c.accent : c.axis}`,
    textDecoration: reached ? 'none' : 'line-through',
    opacity: reached ? 1 : 0.55,
  })
  const wt = { fontSize: 10.5, opacity: 0.7, fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }

  const Lane = ({ top }) => (
    <div
      style={{
        background: top ? c.laneBg : c.tokFill,
        border: `1px solid ${top ? c.border : c.accent}`,
        borderRadius: 2,
        padding: '10px 12px',
        marginBottom: top ? 8 : 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          marginBottom: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ ...laneLabel, color: top ? c.muted : c.accent }}>
          {top ? 'Stem the index · build time' : 'Expand the query · search time'}
        </span>
        <span style={{ ...laneLabel, letterSpacing: '0.03em', color: top ? c.churn : c.accent }}>
          {top ? 'index rewritten' : 'index untouched'}
        </span>
      </div>
      <div className="seh-lane seh-flow" key={`${top ? 'top' : 'bot'}-${i}`}>
        <span
          style={{
            ...chip,
            fontWeight: 600,
            background: c.neutralFill,
            color: c.ink,
            border: `1px solid ${c.axis}`,
          }}
        >
          {C.word}
        </span>
        <span style={arrow}>→</span>
        <span style={mech(!top)}>{top ? 'Porter stem' : 'expand + best match'}</span>
        <span style={arrow}>→</span>
        {top
          ? C.forms.map((f) => (
              <span key={f} style={form(topReached.includes(f))}>
                {f}
              </span>
            ))
          : C.expand.map((e) => (
              <span key={e.t} style={form(true, !C.stemMerges && e.t !== C.word)}>
                {e.t}
                <span style={wt}>{e.w.toFixed(2)}</span>
              </span>
            ))}
      </div>
    </div>
  )

  return (
    <div
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

      {/* header: word tabs + framing */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
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
                  position: 'relative',
                  zIndex: on ? 1 : 0,
                  borderRadius: 2,
                }}
              >
                {cse.word}
              </button>
            )
          })}
        </div>
        <span style={{ ...laneLabel, color: c.muted }}>same word family, two sides</span>
      </div>

      <Lane top />
      <Lane top={false} />

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
            fontFamily: MONO,
            background: tie ? c.neutralFill : c.tokFill,
            color: tie ? c.muted : c.tokText,
            border: `1px solid ${tie ? c.axis : c.accent}`,
            whiteSpace: 'nowrap',
          }}
        >
          {tie
            ? 'same matches · opposite sides'
            : `expansion reaches ${C.forms.length - topReached.length} forms Porter can't`}
        </span>
        <span style={{ fontSize: 12.5, color: c.muted, fontFamily: TEXT, lineHeight: 1.45 }}>
          {C.note}
        </span>
      </div>
    </div>
  )
}

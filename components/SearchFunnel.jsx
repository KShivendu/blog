import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { chartChrome, vizPalette } from '../lib/viz-palette'

// The whole post as one picture: a search starts with every file and each step
// throws some away, until only real matches are left. Each bar is split into
// the files that really match (green) and the ones that don't (grey), so a
// reader sees where the wrong files go and which step removes them.
//
// Every number and every example line is real, exported by the token-regex-rs
// repo (src/bin/positional.rs with EXPORT, merged by scripts/funnel/merge.py)
// into public/static/data/regex-funnel.json.

const DATA_URL = '/static/data/regex-funnel.json'
const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'

const fmt = (n) => n.toLocaleString('en-US')

// how a pattern is shown on a button: the news phrases are written as
// \bbe\ the\b for the regex engine, a reader just wants "be the"
const pretty = (p) => p.replace(/\\b/g, '').replace(/\\ /g, ' ')

const STEPS = [
  {
    key: 'chunks',
    label: 'has every 3-letter piece',
    how: 'token lists + boundary grams',
    why: 'Every file here contains all the 3-letter pieces of the search somewhere. Nothing yet says they are in the right place.',
  },
  {
    key: 'fitting',
    label: 'pieces sit in tokens that fit',
    how: 'fitting, no extra storage',
    why: 'A piece found inside a token only counts if the rest of that token agrees with the search.',
  },
  {
    key: 'positions',
    label: 'pieces are next to each other',
    how: 'token positions',
    why: 'The tokens holding the pieces have to sit side by side, in order, and spell out the text.',
  },
  {
    key: 'truth',
    label: 'the regex agrees',
    how: 'regex on what is left',
    why: 'The last check is the real regex. For plain text it has nothing left to remove.',
  },
]

function Line({ ex, C, P, color }) {
  if (!ex || !ex.text) return null
  const [a, b] = ex.hl || [0, 0]
  const t = ex.text
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 12,
        color: C.ink,
        background: C.grid,
        border: `1px solid ${C.border}`,
        borderRadius: 2,
        padding: '6px 8px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        marginTop: 6,
      }}
    >
      {t.slice(0, a)}
      <span style={{ color: color || P.good, fontWeight: 700, textDecoration: 'underline' }}>
        {t.slice(a, b)}
      </span>
      {t.slice(b)}
    </div>
  )
}

export default function SearchFunnel() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const C = chartChrome(dark)
  const P = vizPalette(dark)

  const [data, setData] = useState(null)
  const [corpus, setCorpus] = useState('code')
  const [qi, setQi] = useState(0)
  const [step, setStep] = useState(1)

  useEffect(() => {
    let live = true
    fetch(DATA_URL)
      .then((r) => r.json())
      .then((d) => live && setData(d))
      .catch(() => live && setData(false))
    return () => {
      live = false
    }
  }, [])

  const box = {
    margin: '2rem 0',
    border: `1px solid ${C.border}`,
    borderRadius: 3,
    background: C.card,
    padding: '14px 16px',
    textAlign: 'left',
  }
  if (!data) {
    return (
      <figure style={box}>
        <div style={{ fontSize: 12, color: C.muted }}>
          {data === false ? 'could not load the funnel data' : 'loading…'}
        </div>
      </figure>
    )
  }

  // open each query on the step that throws the most files away
  const busiest = (x) => {
    const c = [x.chunks, x.fitting, x.positions, x.truth]
    let best = 1
    for (let i = 2; i < 4; i += 1) if (c[i - 1] - c[i] > c[best - 1] - c[best]) best = i
    return best
  }
  const pick = (c, i) => {
    setCorpus(c)
    setQi(i)
    setStep(busiest(data[c].queries[i]))
  }
  const set = data[corpus]
  const q = set.queries[Math.min(qi, set.queries.length - 1)]
  const counts = [q.chunks, q.fitting, q.positions, q.truth]
  const top = Math.max(q.chunks, 1)
  const toggle = (on) => ({
    fontFamily: MONO,
    fontSize: 11,
    padding: '5px 10px',
    cursor: 'pointer',
    border: `1px solid ${on ? P.good : C.border}`,
    background: on ? P.good : 'transparent',
    color: on ? C.card : C.muted,
    borderRadius: 2,
  })

  // what the selected step removed, with the real line that shows why
  const s = STEPS[step]
  const before = step === 0 ? set.files : counts[step - 1]
  const removed = before - counts[step]
  let detail = null
  if (step === 0) {
    detail = (
      <>
        {fmt(set.files - q.chunks)} files lack at least one piece of{' '}
        <code style={{ fontFamily: MONO }}>{q.literals.join(' / ')}</code>, so the index never hands
        them over.
      </>
    )
  } else if (step === 1) {
    const ex = q.dropped_by_fitting
    detail = ex ? (
      <>
        {fmt(removed)} files dropped. In this one, the piece{' '}
        <code style={{ fontFamily: MONO }}>{ex.piece}</code> sits inside the token{' '}
        <code style={{ fontFamily: MONO }}>{ex.token.replace(/ /g, '·')}</code>, whose other letters
        don&apos;t match the search:
        <Line ex={ex} C={C} P={P} color={P.muted} />
      </>
    ) : (
      <>No file dropped at this step.</>
    )
  } else if (step === 2) {
    const ex = q.dropped_by_positions
    detail = ex ? (
      <>
        {fmt(removed)} files dropped. This one has every piece, but never in one row:
        <Line ex={ex} C={C} P={P} color={P.muted} />
      </>
    ) : (
      <>No file dropped at this step.</>
    )
  } else {
    const ex = q.dropped_by_regex
    detail = ex ? (
      <>
        {fmt(removed)} files dropped. The text is there, but the regex wants a word edge around it:
        <Line ex={ex} C={C} P={P} color={P.muted} />
        A real match:
        <Line ex={q.kept_example} C={C} P={P} />
      </>
    ) : (
      <>
        Nothing left to drop.{' '}
        {q.pure ? 'For plain text the positions already gave the answer, ' : ''}
        every file here matches:
        <Line ex={q.kept_example} C={C} P={P} />
      </>
    )
  }

  return (
    <figure style={box}>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
        One search, narrowed down step by step
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
        Real counts over {set.label}. Green is files that really match, grey is files that
        don&apos;t. Click a step to see what it threw away.
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
        {['code', 'news'].map((c) => (
          <button key={c} style={toggle(corpus === c)} onClick={() => pick(c, 0)}>
            {c === 'code' ? 'code search' : 'news phrases'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {set.queries.map((x, i) => (
          <button
            key={x.pattern}
            style={{ ...toggle(i === qi), textTransform: 'none' }}
            onClick={() => pick(corpus, i)}
          >
            {pretty(x.pattern)}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 14, fontSize: 12, color: C.muted, fontFamily: MONO }}>
        all files: {fmt(set.files)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
        {STEPS.map((st, i) => {
          const n = counts[i]
          const real = Math.min(q.truth, n)
          const on = i === step
          return (
            <button
              key={st.key}
              onClick={() => setStep(i)}
              style={{
                textAlign: 'left',
                cursor: 'pointer',
                border: `1px solid ${on ? P.good : C.border}`,
                background: 'transparent',
                borderRadius: 2,
                padding: '6px 8px',
                color: C.ink,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  flexWrap: 'wrap',
                  fontSize: 12,
                }}
              >
                <span>
                  <span style={{ color: C.muted, fontFamily: MONO }}>{i + 1}.</span> {st.label}
                  <span style={{ color: C.muted }}> · {st.how}</span>
                </span>
                <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(n)} files
                  <span style={{ color: C.muted }}>
                    {' '}
                    ({n - real > 0 ? `${fmt(n - real)} wrong` : 'all real'})
                  </span>
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  height: 10,
                  marginTop: 5,
                  width: `${Math.max((n / top) * 100, n > 0 ? 0.8 : 0)}%`,
                  transition: 'width 300ms ease',
                }}
              >
                <div style={{ flex: real || 0, background: P.good, minWidth: real ? 2 : 0 }} />
                <div style={{ flex: n - real || 0, background: P.muted, opacity: 0.55 }} />
              </div>
            </button>
          )
        })}
      </div>

      <div
        style={{
          marginTop: 12,
          padding: '10px 12px',
          border: `1px solid ${C.border}`,
          borderRadius: 2,
          fontSize: 12,
          lineHeight: 1.6,
          color: C.ink,
        }}
      >
        <div style={{ color: C.muted, marginBottom: 4 }}>
          step {step + 1}: {s.why}
        </div>
        {detail}
      </div>
    </figure>
  )
}

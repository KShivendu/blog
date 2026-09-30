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
const pretty = (p) => p.replace(/\\ /g, ' ')

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
    why: 'The last check is the real regex, for what the index cannot check: order, .* staying on one line, word edges.',
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
        fontVariantLigatures: 'none',
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
      .then((d) => {
        if (!live) return
        setData(d)
        const x = d.code.queries[0]
        const c = [x.chunks, x.fitting, x.positions, x.truth]
        let best = 1
        for (let i = 2; i < 4; i += 1) if (c[i - 1] - c[i] > c[best - 1] - c[best]) best = i
        setStep(best)
      })
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
  const es = q.es_wildcard
  const top = Math.max(q.chunks, es || 0, 1)
  const toggle = (on) => ({
    fontFamily: MONO,
    fontVariantLigatures: 'none',
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
        {fmt(removed)} {removed === 1 ? 'file' : 'files'} dropped. In this one, the piece{' '}
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
        {fmt(removed)} {removed === 1 ? 'file' : 'files'} dropped. This one has every piece, but
        never in one row:
        <Line ex={ex} C={C} P={P} color={P.muted} />
      </>
    ) : (
      <>No file dropped at this step.</>
    )
  } else {
    const ex = q.dropped_by_regex
    detail = ex ? (
      <>
        {fmt(removed)} {removed === 1 ? 'file' : 'files'} dropped.{' '}
        {q.pattern.includes('\\b')
          ? 'The text is there, but the regex wants a word edge around it:'
          : 'The text the index can check is there, but the full regex rejects the file, here because the parts are missing, out of order or on different lines:'}
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

  // widths are linear, scaled to the widest band below the mouth; the mouth
  // (all files) is drawn full width with a marked zoom so nothing needs a
  // log scale
  const w = (n) => (n <= 0 ? 0 : Math.max((n / top) * 100, 1.2))
  const core = w(q.truth)
  const zoom = Math.round(set.files / top)
  const band = (a, b, dashed, coreW = core) => (
    <div style={{ position: 'relative', height: '100%', minHeight: 44 }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: P.muted,
          opacity: dashed ? 0.35 : 0.5,
          clipPath: `polygon(${50 - a / 2}% 0, ${50 + a / 2}% 0, ${50 + b / 2}% 100%, ${
            50 - b / 2
          }% 100%)`,
          transition: 'clip-path 350ms ease',
        }}
      />
      {coreW > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${50 - coreW / 2}%`,
            width: `${coreW}%`,
            minWidth: 3,
            background: P.good,
            transition: 'all 350ms ease',
          }}
        />
      )}
    </div>
  )
  const rows = STEPS.map((st, i) => {
    // each band narrows from the files the step received to the files it
    // keeps, so the shaved-off grey sits next to its own "dropped" count
    const n = counts[i]
    const prev = i === 0 ? top : counts[i - 1]
    const out = (i === 0 ? set.files : counts[i - 1]) - n
    return { i, st, n, a: w(prev), b: w(n), out }
  })

  let esDetail = null
  if (step === 4) {
    esDetail = (
      <>
        Elasticsearch&apos;s wildcard field runs its regex on {fmt(es)} files for this search,
        against {fmt(q.positions)} after our step 3.{' '}
        {q.es_case_example
          ? 'It lowercases everything, so it also passes files like this one, where the text only appears with different capitals:'
          : 'Its trigrams carry no token, so it cannot do our steps 2 and 3.'}
        {q.es_case_example && <Line ex={q.es_case_example} C={C} P={P} color={P.muted} />}
      </>
    )
  }

  return (
    <figure style={box}>
      <style>{`
        .sf-row { display: grid; grid-template-columns: 24% 1fr 21%; gap: 10px; align-items: stretch;
          width: 100%; background: transparent; border: 0; padding: 0 4px; cursor: pointer;
          text-align: left; color: inherit; }
        .sf-row:hover .sf-label { color: ${C.ink}; }
        .sf-on .sf-label { box-shadow: inset 3px 0 0 ${P.good}; padding-left: 6px; }
        .sf-side { font-size: 12px; line-height: 1.35; align-self: center; padding: 3px 0; }
        @media (max-width: 560px) {
          .sf-row { grid-template-columns: 1fr; gap: 3px; }
          .sf-drop { order: 3; }
        }
      `}</style>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
        One search, narrowed down step by step
      </div>
      <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
        Real counts over {set.label}. The green column is files that really match, and it never
        narrows. The grey around it is wrong files, shaved off step by step. Click a step to see
        what it threw away.
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

      <div style={{ marginTop: 14, color: C.ink }}>
        <div className="sf-row" style={{ cursor: 'default' }}>
          <div className="sf-side" style={{ fontFamily: MONO }}>
            all {fmt(set.files)} files
          </div>
          {band(100, 100, true, (q.truth / set.files) * 100)}
          <div className="sf-side sf-drop" style={{ color: C.muted }} />
        </div>
        <div
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: C.muted,
            fontFamily: MONO,
            margin: '2px 0 4px',
          }}
        >
          ┄┄ the funnel below is zoomed in {zoom > 1 ? `×${fmt(zoom)}` : ''} ┄┄
        </div>
        {rows.map(({ i, st, n, a, b, out }) => (
          <button
            key={st.key}
            className={i === step ? 'sf-row sf-on' : 'sf-row'}
            onClick={() => setStep(i)}
          >
            <div className="sf-side sf-label">
              <span style={{ color: C.muted, fontFamily: MONO }}>{i + 1}.</span> {st.label}
              <div style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(n)} files
                <span style={{ color: C.muted }}>
                  {' '}
                  (
                  {n - Math.min(q.truth, n) > 0
                    ? `${fmt(n - Math.min(q.truth, n))} wrong`
                    : 'all real'}
                  )
                </span>
              </div>
            </div>
            {band(a, b)}
            <div
              className="sf-side sf-drop"
              style={{ color: out > 0 ? C.ink : C.muted, fontFamily: MONO }}
            >
              {out > 0 ? `→ ${fmt(out)} dropped` : '→ nothing dropped'}
              <div style={{ color: C.muted, fontFamily: 'inherit', fontSize: 11 }}>{st.how}</div>
            </div>
          </button>
        ))}
        {es != null && (
          <button
            className={step === 4 ? 'sf-row sf-on' : 'sf-row'}
            onClick={() => setStep(4)}
            style={{ marginTop: 14, paddingTop: 8, borderTop: `1px dashed ${C.border}` }}
          >
            <div className="sf-side sf-label">
              for comparison: <strong>Elasticsearch wildcard</strong>
              <div style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums' }}>
                {fmt(es)} files reach its regex
              </div>
            </div>
            {band(w(es), w(es), true)}
            <div className="sf-side sf-drop" style={{ color: C.muted, fontSize: 11 }}>
              lowercased 3-letter pieces, no token check
            </div>
          </button>
        )}
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
        {step === 4 ? (
          esDetail
        ) : (
          <>
            <div style={{ color: C.muted, marginBottom: 4 }}>
              step {step + 1}: {STEPS[step].why}
            </div>
            {detail}
          </>
        )}
      </div>
    </figure>
  )
}

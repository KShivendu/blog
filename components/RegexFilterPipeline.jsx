import { useTheme } from 'next-themes'
import { useEffect, useMemo, useRef, useState } from 'react'

import { chartChrome, vizPalette } from '../lib/viz-palette'

// The hero. It walks the five things a regex prefilter does, and the fourth one
// is the point: every posting list arrives at once, because the real operation
// fetches them all and intersects. An earlier version revealed chunks one at a
// time, which taught a pipeline of filters instead of a set intersection.
//
// Documents come from public/static/data/regex-filter-hero.json, written by
// experiments/regex-filter/export_hero_data.py out of CodeSearchNet. The reader
// types their own search and containment is computed live, so the widget cannot
// drift from the benchmark.

const DATA_URL = '/static/data/regex-filter-hero.json'
const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
// One preset per lesson: an exact hit, a wider one, a search whose chunks all
// land in the wrong places, and a pattern that pins down no text at all.
const PRESETS = ['get_user', 'def get', 'return self', '\\s+']
const STEP_MS = 1700
const HOLD_MS = 3200

const STEPS = [
  'a search arrives',
  'keep only the text it guarantees',
  'chop that into chunks',
  'fetch every chunk’s document list at once',
  'keep the documents on every list',
  'run the real regex on those',
]

// The literal text a regex guarantees. Anything under ? or * is optional and a
// character class pins nothing down, so neither can be required.
function requiredLiteral(pattern) {
  const out = []
  let cur = ''
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i]
    const next = pattern[i + 1]
    if (c === '\\') {
      cur = ''
      i += 1
      continue
    }
    if ('[](){}|^$.*+?'.includes(c)) {
      if (c === '[') {
        const close = pattern.indexOf(']', i + 1)
        i = close < 0 ? pattern.length : close
      }
      out.push(cur)
      cur = ''
      continue
    }
    if (next === '?' || next === '*') {
      out.push(cur)
      cur = ''
      i += 1
      continue
    }
    cur += c
  }
  out.push(cur)
  return out.sort((a, b) => b.length - a.length)[0] || ''
}

const chunksOf = (lit) =>
  lit.length < 3 ? [] : Array.from({ length: lit.length - 2 }, (_, i) => lit.slice(i, i + 3))

export default function RegexFilterPipeline() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const C = chartChrome(dark)
  const P = vizPalette(dark)

  const [docs, setDocs] = useState(null)
  const [query, setQuery] = useState('get_user')
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [inView, setInView] = useState(false)
  const [reduced, setReduced] = useState(false)
  const wrap = useRef(null)

  useEffect(() => {
    let live = true
    fetch(DATA_URL)
      .then((r) => r.json())
      .then((d) => live && setDocs(d.docs))
      .catch(() => live && setDocs([]))
    return () => {
      live = false
    }
  }, [])

  // Readers who asked for less motion get the finished frame, not a loop.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      setReduced(mq.matches)
      if (mq.matches) setStep(STEPS.length - 1)
    }
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])

  useEffect(() => {
    const node = wrap.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return undefined
    }
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 })
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (reduced || !playing || !inView) return undefined
    const last = STEPS.length - 1
    const t = setTimeout(
      () => setStep((s) => (s + 1) % STEPS.length),
      step === last ? HOLD_MS : STEP_MS
    )
    return () => clearTimeout(t)
  }, [step, playing, inView, reduced])

  const model = useMemo(() => {
    if (!docs || !docs.length) return null
    const lit = requiredLiteral(query)
    const chunks = chunksOf(lit)
    const rows = chunks.map((g) => ({ g, hits: docs.map((d) => d.text.includes(g)) }))
    const survives = docs.map((_, i) => rows.length > 0 && rows.every((r) => r.hits[i]))
    let truth = docs.map(() => false)
    let valid = true
    try {
      const rx = new RegExp(query)
      truth = docs.map((d) => rx.test(d.text))
    } catch {
      valid = false
    }
    const running = []
    let alive = docs.map(() => true)
    rows.forEach((r) => {
      alive = alive.map((a, i) => a && r.hits[i])
      running.push(alive.filter(Boolean).length)
    })
    const at = lit ? query.indexOf(lit) : -1
    return { lit, chunks, rows, survives, truth, valid, running, at }
  }, [docs, query])

  if (!docs) {
    return (
      <figure style={{ margin: '2rem 0', padding: 16, color: C.muted, fontSize: 12 }}>
        loading the corpus...
      </figure>
    )
  }

  const m = model
  const none = !m || m.chunks.length === 0
  const nSurv = m && !none ? m.survives.filter(Boolean).length : docs.length
  const nTrue = m ? m.truth.filter(Boolean).length : 0
  const nFalse = m && !none ? m.survives.filter((s, i) => s && !m.truth[i]).length : 0

  const restart = (v) => {
    setQuery(v)
    if (!reduced) setStep(0)
  }

  const cell = (on, tone) => ({
    width: 13,
    height: 13,
    borderRadius: 1,
    flex: '0 0 auto',
    background: on ? tone : dark ? '#141922' : '#eef1f6',
    transition: 'background .3s ease',
  })

  const rowsVisible = step >= 3
  const andVisible = step >= 4
  const verified = step >= 5

  return (
    <figure
      ref={wrap}
      style={{
        margin: '2rem 0',
        border: `1px solid ${C.border}`,
        borderRadius: 3,
        background: C.card,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 16px 0',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
            What a regex filter actually does
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            24 real Python functions from CodeSearchNet. Type your own search and it recomputes.
          </div>
        </div>
        {!reduced && (
          <button
            onClick={() => setPlaying((x) => !x)}
            aria-label={playing ? 'pause the walkthrough' : 'play the walkthrough'}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              padding: '4px 9px',
              height: 26,
              cursor: 'pointer',
              border: `1px solid ${C.border}`,
              borderRadius: 2,
              background: 'transparent',
              color: C.muted,
            }}
          >
            {playing ? 'pause' : 'play'}
          </button>
        )}
      </div>

      {/* step rail, clickable so a reader can go straight to a stage */}
      <div style={{ display: 'flex', gap: 3, padding: '12px 16px 0' }} role="group">
        {STEPS.map((s, k) => (
          <button
            key={s}
            onClick={() => {
              setStep(k)
              setPlaying(false)
            }}
            aria-pressed={k === step}
            style={{
              flex: 1,
              minWidth: 0,
              textAlign: 'left',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                height: 3,
                borderRadius: 1,
                background: k < step ? P.muted : k === step ? C.ink : C.grid,
                marginBottom: 5,
                transition: 'background .25s ease',
              }}
            />
            <div
              style={{
                fontSize: 10.5,
                lineHeight: 1.3,
                color: k === step ? C.ink : C.muted,
                opacity: k <= step ? 1 : 0.55,
                paddingRight: 6,
              }}
            >
              {k + 1}. {s}
            </div>
          </button>
        ))}
      </div>

      {/* the query, and the literal inside it */}
      <div
        style={{
          padding: '14px 16px 0',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          value={query}
          onChange={(e) => restart(e.target.value)}
          spellCheck={false}
          aria-label="search pattern"
          style={{
            fontFamily: MONO,
            fontSize: 14,
            padding: '6px 9px',
            minWidth: 190,
            flex: '1 1 190px',
            color: C.ink,
            background: dark ? '#0a0f0d' : '#f7f9f8',
            border: `1px solid ${m && !m.valid ? P.bad : C.border}`,
            borderRadius: 2,
          }}
        />
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => restart(p)}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              padding: '4px 8px',
              cursor: 'pointer',
              border: `1px solid ${C.border}`,
              borderRadius: 2,
              background: query === p ? C.ink : 'transparent',
              color: query === p ? C.card : C.muted,
            }}
          >
            {p}
          </button>
        ))}
      </div>

      <div style={{ padding: '11px 16px 0', fontSize: 11.5, color: C.muted, minHeight: 34 }}>
        {step === 0 && <span>The pattern as typed. Most of it is shape rather than text.</span>}
        {step === 1 &&
          (none ? (
            <span>Nothing here is guaranteed. Every character sits under a class or a star.</span>
          ) : (
            <span>
              Only <code style={{ fontFamily: MONO, color: P.good }}>{m.lit}</code> has to be
              present in a match, so that is all the filter may require.
            </span>
          ))}
        {step >= 2 &&
          (none ? (
            <span>
              No run of three fixed characters, so there is nothing to look up and all {docs.length}{' '}
              documents get read.
            </span>
          ) : (
            <span>
              <code style={{ fontFamily: MONO, color: C.ink }}>{m.lit}</code> becomes{' '}
              {m.chunks.length} chunks, and a document must hold every one of them.
            </span>
          ))}
      </div>

      {/* chunks */}
      <div
        style={{
          padding: '8px 16px 0',
          display: 'flex',
          gap: 4,
          flexWrap: 'wrap',
          minHeight: 28,
        }}
      >
        {step >= 2 &&
          !none &&
          m.chunks.map((g) => (
            <code
              key={g}
              style={{
                fontFamily: MONO,
                fontSize: 11.5,
                padding: '2px 6px',
                border: `1px solid ${C.border}`,
                borderRadius: 2,
                color: C.ink,
                whiteSpace: 'pre',
              }}
            >
              {g.replace(/ /g, '·')}
            </code>
          ))}
      </div>

      {/* the index: one row per chunk, every row arriving together */}
      <div style={{ padding: '10px 16px 0', overflowX: 'auto', minHeight: 130 }}>
        {!none &&
          m.rows.map((r, ri) => (
            <div
              key={r.g}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                marginBottom: 3,
                opacity: rowsVisible ? 1 : 0,
                transition: 'opacity .4s ease',
              }}
            >
              <code
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: C.ink,
                  width: 32,
                  textAlign: 'right',
                  flex: '0 0 auto',
                }}
              >
                {r.g.replace(/ /g, '·')}
              </code>
              <div style={{ display: 'flex', gap: 2 }}>
                {r.hits.map((h, i) => (
                  <span key={i} style={cell(rowsVisible && h, P.muted)} title={docs[i].label} />
                ))}
              </div>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, paddingLeft: 4 }}>
                {r.hits.filter(Boolean).length}
                {andVisible && <span style={{ opacity: 0.65 }}> &rarr; {m.running[ri]} left</span>}
              </span>
            </div>
          ))}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            marginTop: 6,
            paddingTop: 6,
            borderTop: `1px solid ${C.border}`,
            opacity: andVisible || none ? 1 : 0.25,
            transition: 'opacity .4s ease',
          }}
        >
          <code
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: C.ink,
              width: 32,
              textAlign: 'right',
              flex: '0 0 auto',
              fontWeight: 600,
            }}
          >
            AND
          </code>
          <div style={{ display: 'flex', gap: 2 }}>
            {docs.map((d, i) => {
              const keep = none || (andVisible && m.survives[i])
              const tone = verified && !none ? (m.truth[i] ? P.good : P.muted) : P.good
              return <span key={i} style={cell(keep, none ? P.muted : tone)} title={d.label} />
            })}
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink, paddingLeft: 4 }}>
            {nSurv} to check
          </span>
        </div>
      </div>

      <div
        style={{
          margin: '14px 0 0',
          padding: '11px 16px',
          borderTop: `1px solid ${C.border}`,
          background: dark ? '#0a0f0d' : '#f7f9f8',
          fontSize: 11.5,
          color: C.muted,
          lineHeight: 1.7,
          minHeight: 64,
        }}
      >
        {none ? (
          <span>
            Every index in this post fails the same way here, TopK&rsquo;s included. A filter can
            only look up fixed text, and this pattern names none.
          </span>
        ) : verified ? (
          <>
            The regex ran on{' '}
            <strong style={{ color: C.ink }}>
              {nSurv} of {docs.length}
            </strong>{' '}
            documents and found <strong style={{ color: P.good }}>{nTrue}</strong>.
            {nFalse > 0 ? (
              <>
                {' '}
                The other {nFalse} hold every chunk in scattered places. A filter may hand over
                junk, and may never drop a match.
              </>
            ) : (
              <> Here the chunks alone were exact.</>
            )}
          </>
        ) : (
          <span>
            Every list is fetched together and intersected. Nothing is read from a document until
            the last step.
          </span>
        )}
      </div>
    </figure>
  )
}

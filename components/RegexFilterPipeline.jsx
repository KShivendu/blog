import { useTheme } from 'next-themes'
import { useEffect, useMemo, useState } from 'react'

import { chartChrome, vizPalette } from '../lib/viz-palette'

// The hero. Every regex prefilter chops text into chunks and records which
// documents each chunk appears in. That record IS the index, so it is the thing
// on screen: one row per chunk, one column per document, and the AND across
// rows is what the verifier actually receives.
//
// Rows are all present at once because the real operation fetches every posting
// list and intersects them. An earlier version applied chunks one at a time,
// which taught a pipeline of filters instead of a set intersection.
//
// Documents come from public/static/data/regex-filter-hero.json, written by
// experiments/regex-filter/export_hero_data.py out of CodeSearchNet. The reader
// types their own search and the containment is computed live, so this widget
// cannot drift from the benchmark and cannot be disagreed with by hand.

const DATA_URL = '/static/data/regex-filter-hero.json'
const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
const PRESETS = ['get_user', 'return self', 'datestamp', '\\s+']

// The literal text a regex guarantees. Anything under a ? or * is optional, and
// a character class pins nothing down, so neither can be required.
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

  const model = useMemo(() => {
    if (!docs || !docs.length) return null
    const lit = requiredLiteral(query)
    const chunks = chunksOf(lit)
    const rows = chunks.map((g) => ({
      g,
      hits: docs.map((d) => d.text.includes(g)),
    }))
    // Every chunk must be present, so the survivors are the columns marked in
    // every row. With no usable chunk there is no constraint and everything
    // survives, which is the fallback the post is about.
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
    return { lit, chunks, rows, survives, truth, valid, running }
  }, [docs, query])

  if (!docs) {
    return (
      <figure style={{ margin: '2rem 0', padding: 16, color: C.muted, fontSize: 12 }}>
        loading the corpus...
      </figure>
    )
  }

  const m = model
  const nSurv = m ? m.survives.filter(Boolean).length : docs.length
  const nTrue = m ? m.truth.filter(Boolean).length : 0
  const nFalse = m ? m.survives.filter((s, i) => s && !m.truth[i]).length : 0
  const noConstraint = !m || m.chunks.length === 0

  const cell = (on, tone) => ({
    width: 13,
    height: 13,
    borderRadius: 1,
    flex: '0 0 auto',
    background: on ? tone : dark ? '#141922' : '#eef1f6',
    transition: 'background .2s ease',
  })

  return (
    <figure
      style={{
        margin: '2rem 0',
        border: `1px solid ${C.border}`,
        borderRadius: 3,
        background: C.card,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
          Chop the search, look up each chunk, keep what every list agrees on
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
          24 real Python functions from CodeSearchNet. Type anything and the lists below are
          recomputed.
        </div>
      </div>

      <div
        style={{
          padding: '12px 16px 0',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          aria-label="search pattern"
          style={{
            fontFamily: MONO,
            fontSize: 14,
            padding: '6px 9px',
            minWidth: 210,
            flex: '1 1 210px',
            color: C.ink,
            background: dark ? '#0a0f0d' : '#f7f9f8',
            border: `1px solid ${m && !m.valid ? P.bad : C.border}`,
            borderRadius: 2,
          }}
        />
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setQuery(p)}
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

      <div style={{ padding: '12px 16px 0', fontSize: 11, color: C.muted }}>
        {noConstraint ? (
          <span>
            No run of three or more fixed characters, so there is nothing to look up and every
            document has to be read.
          </span>
        ) : (
          <span>
            guaranteed text <code style={{ fontFamily: MONO, color: C.ink }}>{m.lit}</code>, chopped
            into {m.chunks.length} chunks
          </span>
        )}
      </div>

      {/* the index: one row per chunk, one column per document */}
      <div style={{ padding: '10px 16px 0', overflowX: 'auto' }}>
        {m &&
          m.rows.map((r, ri) => (
            <div
              key={r.g}
              style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}
            >
              <code
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: C.ink,
                  width: 34,
                  textAlign: 'right',
                  flex: '0 0 auto',
                }}
              >
                {r.g.replace(/ /g, '·')}
              </code>
              <div style={{ display: 'flex', gap: 2 }}>
                {r.hits.map((h, i) => (
                  <span key={i} style={cell(h, P.muted)} title={docs[i].label} />
                ))}
              </div>
              <span style={{ fontFamily: MONO, fontSize: 10, color: C.muted, paddingLeft: 4 }}>
                {r.hits.filter(Boolean).length} docs
                <span style={{ opacity: 0.6 }}> &rarr; {m.running[ri]} left</span>
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
          }}
        >
          <code
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: C.ink,
              width: 34,
              textAlign: 'right',
              flex: '0 0 auto',
              fontWeight: 600,
            }}
          >
            AND
          </code>
          <div style={{ display: 'flex', gap: 2 }}>
            {docs.map((d, i) => (
              <span
                key={i}
                style={cell(noConstraint || m.survives[i], noConstraint ? P.muted : P.good)}
                title={d.label}
              />
            ))}
          </div>
          <span style={{ fontFamily: MONO, fontSize: 10, color: C.ink, paddingLeft: 4 }}>
            {noConstraint ? docs.length : nSurv} to check
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
          minHeight: 62,
        }}
      >
        {noConstraint ? (
          <span>
            Every index in this post fails the same way here, TopK&rsquo;s included. A filter can
            only look up fixed text, and this pattern names none.
          </span>
        ) : (
          <>
            The real regex now runs on{' '}
            <strong style={{ color: C.ink }}>
              {nSurv} of {docs.length}
            </strong>{' '}
            documents and finds <strong style={{ color: P.good }}>{nTrue}</strong>.
            {nFalse > 0 ? (
              <>
                {' '}
                The other {nFalse} hold every chunk scattered in different places, which is the cost
                of a filter that may hand over junk but may never drop a match.
              </>
            ) : (
              <> Here the chunks alone were exact.</>
            )}
          </>
        )}
      </div>
    </figure>
  )
}

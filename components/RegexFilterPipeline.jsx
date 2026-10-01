import { useTheme } from 'next-themes'
import { useEffect, useMemo, useRef, useState } from 'react'

import { requiredText, chunksOf, chunkLists, docTokens } from '../lib/regex-required'
import { chartChrome, vizPalette } from '../lib/viz-palette'

// The hero: what a regex prefilter does, on 8 real files. One table. Columns
// are the chunks of the text every match must contain, headed by the posting
// lists each chunk really reads: a token's BM25 list (blue), or a boundary gram
// where the chunk falls on a token cut (amber). No list is keyed by a chunk.
// Rows are files; the last column is the verdict.
//
// Files come from public/static/data/regex-filter-hero.json (CodeSearchNet,
// GPT-2 token cuts), written by experiments/regex-filter/export_hero_data.py.
// Everything is computed live, so a typed search works like the presets.

const DATA_URL = '/static/data/regex-filter-hero.json'
// Eight of the file's 24, mixed so each preset has a match, a file that gets
// through the lists and fails the regex, and files the lists drop.
const PICK = [6, 7, 13, 3, 8, 0, 16, 11]
const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
const PRESETS = ['get_\\w*conn', 'user_\\w+ = ', '\\s+']
const STEP_MS = [1600, 2200, 2400, 2600, 5000]
const STEPS = [
  'A regex search comes in.',
  'Keep the text every match must contain, in 3-letter chunks.',
  'The vocabulary names the posting lists each chunk reads.',
  'Fetch those lists. Keep files that are on one under every chunk.',
  'Run the real regex on the files that are left.',
]
const MAX_KEYS = 2

const show = (s) => s.replace(/ /g, '·').replace(/\n/g, '⏎')
const fnName = (label) => {
  const m = /def\s+(\w+)/.exec(label)
  const n = m ? m[1] : label
  return n.length > 12 ? `${n.slice(0, 11)}…` : n
}

// Which list holds file i for this column: the token it holds (blue) or the
// boundary gram (amber). Tokens first, since that is the common case.
function holder(col, doc, i) {
  for (const r of col.rows) {
    if (!r.hits[i] || r.kind === 'gram') continue
    const keys = r.kind === 'more' ? r.keys : [r.key]
    const t = keys.find((k) => docTokens(doc).some((x) => x.t === k))
    return { kind: 'token', key: t ?? r.key }
  }
  const g = col.rows.find((r) => r.kind === 'gram' && r.hits[i])
  return g ? { kind: 'gram', key: g.key } : null
}

export default function RegexFilterPipeline() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const C = chartChrome(dark)
  const P = vizPalette(dark)

  const [docs, setDocs] = useState(null)
  const [query, setQuery] = useState(PRESETS[0])
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [inView, setInView] = useState(false)
  const [reduced, setReduced] = useState(false)
  const wrap = useRef(null)
  const last = STEPS.length - 1

  useEffect(() => {
    let live = true
    fetch(DATA_URL)
      .then((r) => r.json())
      .then((d) => live && setDocs(PICK.map((i) => d.docs[i]).filter(Boolean)))
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
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEP_MS[step])
    return () => clearTimeout(t)
  }, [step, playing, inView, reduced])

  const m = useMemo(() => {
    if (!docs || !docs.length) return null
    const { branches, filterable } = requiredText(query)
    let rx = null
    try {
      rx = new RegExp(query)
    } catch {
      rx = null
    }
    const kept = new Set()
    // One column per chunk. Chunks that read the same lists share a column,
    // since the engine fetches those lists once.
    const cols = []
    branches.forEach((pieces, b) => {
      const seen = new Map()
      pieces.forEach((pc) => {
        pc.pos.forEach((p) => kept.add(p))
        chunksOf(pc.text).forEach((_, p) => {
          const c = chunkLists(docs, pc.text, p)
          const sig = c.rows.map((r) => `${r.kind}:${r.key}`).join('|') || `none:${c.g}`
          if (seen.has(sig)) seen.get(sig).gs.push(c.g)
          else {
            const col = { ...c, gs: [c.g], band: b }
            seen.set(sig, col)
            cols.push(col)
          }
        })
      })
    })
    const pass = docs.map(
      (_, i) =>
        !filterable ||
        branches.some((_, b) => cols.filter((c) => c.band === b).every((c) => c.pass[i]))
    )
    const truth = docs.map((d) => (rx ? rx.test(d.text) : false))
    return { cols, filterable, pass, truth, rx, kept }
  }, [docs, query])

  if (!docs) {
    return (
      <figure style={{ margin: '2rem 0', padding: 16, color: C.muted, fontSize: 12 }}>
        loading...
      </figure>
    )
  }

  const go = (k) => {
    setStep(k)
    setPlaying(false)
  }
  const pick = (v) => {
    setQuery(v)
    if (!reduced) {
      setStep(0)
      setPlaying(true)
    }
  }
  const nKept = m ? m.pass.filter(Boolean).length : docs.length
  const nTrue = m ? m.truth.filter(Boolean).length : 0
  const nCols = m ? m.cols.length : 0
  const tone = (kind) => (kind === 'gram' ? P.series2 : P.series1)
  const fade = 'opacity .35s ease'
  const newBand = (ci) => ci > 0 && m.cols[ci].band !== m.cols[ci - 1].band

  const caption = () => {
    if (!m) return ''
    if (!m.filterable && step >= 1) {
      return `No fixed text here, so there is nothing to look up. All ${docs.length} files get read.`
    }
    if (step === 0) return 'Most of a pattern describes shape, not text.'
    if (step === 1) return 'Underlined text must appear in every match. Each column is one chunk.'
    if (step === 2) {
      return 'Blue keys are tokens that hold the chunk: BM25’s own lists. Amber is a boundary gram, stored only where a chunk crosses a token cut.'
    }
    if (step === 3) {
      return `${nKept} of ${docs.length} files are on a list in every column. No file has been read yet.`
    }
    return nKept === nTrue
      ? `The regex read ${nKept} files and all ${nTrue} match.`
      : `The regex read ${nKept} files and ${nTrue} match. The rest hold every chunk, not in the right shape.`
  }

  return (
    <figure
      ref={wrap}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.target.tagName === 'INPUT') return
        if (e.key === 'ArrowRight') go(Math.min(last, step + 1))
        if (e.key === 'ArrowLeft') go(Math.max(0, step - 1))
      }}
      style={{
        margin: '2rem 0',
        padding: '14px 16px',
        border: `1px solid ${C.border}`,
        borderRadius: 3,
        background: C.card,
        textAlign: 'left',
        outline: 'none',
      }}
    >
      <style>{`
        .rfp-table { display: grid; column-gap: 6px; row-gap: 4px; align-items: center; min-width: max-content;
          grid-template-columns: max-content repeat(var(--n), minmax(46px, 74px)) 60px; }
        @media (max-width: 560px) {
          .rfp-table { column-gap: 4px; min-width: 0; grid-template-columns: minmax(0, 76px) repeat(var(--n), minmax(28px, 1fr)) 44px; }
          .rfp-table code, .rfp-table span { font-size: 9.5px !important }
        }
        @media (prefers-reduced-motion: reduce) { .rfp-table * { transition: none !important } }
      `}</style>

      {/* step rail and caption */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 3, flex: 1 }} role="group" aria-label="steps">
          {STEPS.map((s, k) => (
            <button
              key={s}
              onClick={() => go(k)}
              aria-label={`step ${k + 1}: ${s}`}
              aria-pressed={k === step}
              style={{
                flex: 1,
                padding: '6px 0',
                border: 0,
                background: 'none',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  height: 4,
                  borderRadius: 1,
                  background: k <= step ? C.ink : C.grid,
                  opacity: k < step ? 0.35 : 1,
                  transition: 'background .25s, opacity .25s',
                }}
              />
            </button>
          ))}
        </div>
        {!reduced && (
          <button
            onClick={() => setPlaying((x) => !x)}
            aria-label={playing ? 'pause' : 'play'}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              padding: '2px 8px',
              border: `1px solid ${C.border}`,
              borderRadius: 2,
              background: 'none',
              color: C.muted,
              cursor: 'pointer',
            }}
          >
            {playing ? 'pause' : 'play'}
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 4 }}>
        {step + 1}. {STEPS[step]}
      </div>

      {/* the search */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPlaying(false)
            setStep(last)
          }}
          spellCheck={false}
          aria-label="search pattern"
          style={{
            fontFamily: MONO,
            fontSize: 13,
            padding: '4px 8px',
            minWidth: 0,
            flex: '1 1 160px',
            color: C.ink,
            background: 'none',
            border: `1px solid ${m && !m.rx ? P.bad : C.border}`,
            borderRadius: 2,
          }}
        />
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => pick(p)}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              padding: '3px 7px',
              border: `1px solid ${C.border}`,
              borderRadius: 2,
              cursor: 'pointer',
              whiteSpace: 'pre',
              background: query === p ? C.ink : 'none',
              color: query === p ? C.card : C.muted,
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* the pattern: what's fixed text, what's shape */}
      <div
        style={{
          fontFamily: MONO,
          fontSize: 17,
          marginTop: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {[...query].map((ch, i) => {
          const keep = m?.kept.has(i)
          return (
            <span
              key={i}
              style={{
                color: C.ink,
                opacity: step >= 1 && !keep ? 0.28 : 1,
                textDecoration: step >= 1 && keep ? 'underline' : 'none',
                textDecorationThickness: 2,
                textUnderlineOffset: 4,
                transition: fade,
              }}
            >
              {ch === ' ' && step >= 1 && keep ? '·' : ch}
            </span>
          )
        })}
      </div>

      {/* the table: files down, chunks across */}
      {m && (
        <div style={{ overflowX: 'auto', marginTop: 14 }}>
          <div className="rfp-table" style={{ '--n': nCols }}>
            {/* header: the chunk, then the keys it reads */}
            <span />
            {m.cols.map((c, ci) => (
              <div
                key={ci}
                style={{
                  alignSelf: 'end',
                  borderLeft: newBand(ci) ? `1px dashed ${C.axis}` : 'none',
                  paddingLeft: newBand(ci) ? 6 : 0,
                  opacity: step >= 1 ? 1 : 0,
                  transition: fade,
                  transitionDelay: step === 1 ? `${ci * 90}ms` : '0ms',
                }}
              >
                <code
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: C.muted,
                    padding: '0 3px',
                    border: `1px dashed ${C.axis}`,
                    borderRadius: 2,
                    whiteSpace: 'pre',
                  }}
                >
                  {newBand(ci) ? 'or ' : ''}
                  {c.gs.map(show).join(' ')}
                </code>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                    marginTop: 4,
                    opacity: step >= 2 ? 1 : 0,
                    transition: fade,
                    transitionDelay: step === 2 ? `${ci * 120}ms` : '0ms',
                  }}
                >
                  {c.rows.length === 0 && (
                    <span style={{ fontSize: 10, color: C.muted }}>no list</span>
                  )}
                  {c.rows
                    .filter((r) => r.kind === 'token')
                    .slice(0, MAX_KEYS)
                    .concat(c.rows.filter((r) => r.kind === 'gram'))
                    .map((r) => (
                      <code
                        key={r.kind + r.key}
                        style={{
                          fontFamily: MONO,
                          fontSize: 10,
                          color: C.ink,
                          padding: '0 3px',
                          borderLeft: `3px solid ${tone(r.kind)}`,
                          whiteSpace: 'pre',
                          maxWidth: '100%',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {show(r.key)}
                      </code>
                    ))}
                  {c.nTokens > MAX_KEYS && (
                    <span style={{ fontSize: 10, color: C.muted, paddingLeft: 6 }}>
                      +{c.nTokens - MAX_KEYS} tokens
                    </span>
                  )}
                </div>
              </div>
            ))}
            <span />

            {/* one row per file */}
            {docs.map((d, i) => {
              const out = step >= 3 && !m.pass[i]
              let verdict = ''
              if (step >= 3)
                verdict = !m.pass[i]
                  ? 'dropped'
                  : step < 4
                  ? 'kept'
                  : m.truth[i]
                  ? 'match'
                  : 'no match'
              return [
                <code
                  key={`n${i}`}
                  title={d.label}
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: C.ink,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    opacity: out ? 0.35 : 1,
                    transition: fade,
                  }}
                >
                  {fnName(d.label)}
                </code>,
                ...m.cols.map((c, ci) => {
                  const h = holder(c, d, i)
                  const on = step >= 3 && h
                  return (
                    <span
                      key={`c${i}-${ci}`}
                      title={
                        h
                          ? `${d.label} is on the ${
                              h.kind === 'gram' ? 'boundary gram' : 'token'
                            } list ${show(h.key)}`
                          : `${d.label} is on none of these lists`
                      }
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        lineHeight: '16px',
                        height: 16,
                        padding: '0 4px',
                        marginLeft: newBand(ci) ? 7 : 0,
                        borderRadius: 2,
                        whiteSpace: 'pre',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        color: on ? C.card : 'transparent',
                        background: on ? tone(h.kind) : C.grid,
                        opacity: out ? 0.35 : 1,
                        transition: 'background .3s ease, color .3s ease, opacity .35s ease',
                        transitionDelay: step === 3 ? `${ci * 150 + i * 30}ms` : '0ms',
                      }}
                    >
                      {h ? show(h.key) : ''}
                    </span>
                  )
                }),
                <span
                  key={`v${i}`}
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: verdict === 'match' ? P.good : verdict === 'kept' ? C.ink : C.muted,
                    fontWeight: verdict === 'match' ? 600 : 400,
                    whiteSpace: 'nowrap',
                    transition: fade,
                  }}
                >
                  {verdict}
                </span>,
              ]
            })}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, marginTop: 12, minHeight: 38 }}>
        {caption()}
      </div>
    </figure>
  )
}

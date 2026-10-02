import { useTheme } from 'next-themes'
import { useEffect, useMemo, useRef, useState } from 'react'

import { requiredText, chunksOf, chunkLists, docTokens } from '../lib/regex-required'
import { chartChrome, vizPalette } from '../lib/viz-palette'

// The hero: what a regex prefilter does, on 8 real files. It is drawn the way
// a posting list is drawn: one row per list, one column per file, a filled
// cell where the file is on the list. Rows are grouped under the chunk that
// reads them. A chunk is a lookup, never a key: the vocabulary names the
// tokens that hold it (blue, BM25's own lists), and where it falls on a token
// cut its boundary gram is read too (amber). The last two rows are the AND and
// the regex check.
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
  return n.length > 14 ? `${n.slice(0, 13)}…` : n
}

// Where a list's key sits in a file, as a short line of text around it:
// the token itself for a token list, the 3 bytes for a boundary gram.
function whereInFile(doc, r) {
  let at = -1
  let len = 0
  if (r.kind === 'gram') {
    const cuts = doc.cuts || []
    let i = doc.text.indexOf(r.key)
    while (i >= 0 && !cuts.some((c) => c > i && c < i + r.key.length)) {
      i = doc.text.indexOf(r.key, i + 1)
    }
    at = i
    len = r.key.length
  } else {
    const keys = r.kind === 'more' ? r.keys : [r.key]
    const tok = docTokens(doc).find((x) => keys.includes(x.t))
    if (tok) {
      at = tok.s
      len = tok.t.length
    }
  }
  if (at < 0) return null
  const flat = (x) => x.replace(/\s+/g, ' ')
  const a = Math.max(0, at - 28)
  const b = Math.min(doc.text.length, at + len + 28)
  return {
    before: (a > 0 ? '…' : '') + flat(doc.text.slice(a, at)).trimStart(),
    hit: show(doc.text.slice(at, at + len)),
    after: flat(doc.text.slice(at + len, b)).trimEnd() + (b < doc.text.length ? '…' : ''),
  }
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
  const [hover, setHover] = useState(null)
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
          const c = chunkLists(docs, pc.text, p, MAX_KEYS)
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
  const tone = (kind) => (kind === 'gram' ? P.series2 : P.series1)
  const fade = 'opacity .35s ease'

  const caption = () => {
    if (!m) return ''
    if (!m.filterable && step >= 1) {
      return `No fixed text here, so there is nothing to look up. All ${docs.length} files get read.`
    }
    if (step === 0) return 'Most of a pattern describes shape, not text.'
    if (step === 1)
      return 'Underlined text must appear in every match. Each dashed box is one chunk.'
    if (step === 2) {
      return 'Each row is a posting list. Blue rows are tokens that hold the chunk: BM25’s own lists. Amber is a boundary gram, stored only where a chunk crosses a token cut.'
    }
    if (step === 3) {
      return `A file stays if each chunk has a list that holds it. ${nKept} of ${docs.length} do. No file has been read yet.`
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
        .rfp-table { display: grid; gap: 3px; align-items: center; justify-content: start;
          grid-template-columns: auto minmax(0, 104px) repeat(var(--n), 26px); }
        .rfp-doc { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 10px; line-height: 26px;
          white-space: nowrap; justify-self: center; padding-bottom: 4px; }
        @media (max-width: 480px) {
          .rfp-table { gap: 2px; grid-template-columns: minmax(0, 46px) minmax(0, 70px) repeat(var(--n), minmax(14px, 22px)); }
          .rfp-doc { line-height: 20px }
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

      {/* posting lists down, files across */}
      {m && m.filterable && (
        <div style={{ marginTop: 14, maxWidth: '100%' }}>
          <div
            className="rfp-table"
            style={{ '--n': docs.length }}
            onMouseLeave={() => setHover(null)}
          >
            {/* file names up the columns */}
            <span />
            <span />
            {docs.map((d, i) => (
              <span
                key={i}
                className="rfp-doc"
                onMouseEnter={() => setHover({ i })}
                onClick={() => setHover({ i })}
                style={{
                  fontFamily: MONO,
                  color: C.ink,
                  opacity: step >= 3 && !m.pass[i] ? 0.3 : 1,
                  transition: fade,
                }}
              >
                {fnName(d.label)}
              </span>
            ))}

            {m.cols.map((c, ci) => {
              const rows = c.rows.length
                ? c.rows
                : [{ kind: 'none', key: 'no list', hits: docs.map(() => false) }]
              const orGap = ci > 0 && c.band !== m.cols[ci - 1].band
              const top = ci > 0 && !orGap ? 6 : 0
              return [
                orGap && (
                  <span
                    key={`or${ci}`}
                    style={{
                      gridColumn: '1 / -1',
                      fontSize: 10,
                      color: C.muted,
                      borderTop: `1px dashed ${C.axis}`,
                      marginTop: 6,
                      paddingTop: 2,
                    }}
                  >
                    or
                  </span>
                ),
                ...rows.map((r, ri) => {
                  const mt = ri === 0 ? top : 0
                  return [
                    <span key={`g${ci}-${ri}`} style={{ marginTop: mt }}>
                      {ri === 0 && (
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            color: C.muted,
                            padding: '0 3px',
                            border: `1px dashed ${C.axis}`,
                            borderRadius: 2,
                            whiteSpace: 'pre',
                            opacity: step >= 1 ? 1 : 0,
                            transition: fade,
                            transitionDelay: step === 1 ? `${ci * 90}ms` : '0ms',
                          }}
                        >
                          {c.gs.map(show).join(' ')}
                        </span>
                      )}
                    </span>,
                    <span
                      key={`k${ci}-${ri}`}
                      title={r.kind === 'more' ? r.keys.map(show).join(' ') : undefined}
                      style={{
                        marginTop: mt,
                        fontFamily: MONO,
                        fontSize: 10.5,
                        color: r.kind === 'none' ? C.muted : C.ink,
                        padding: '0 4px',
                        borderLeft: r.kind === 'none' ? 'none' : `3px solid ${tone(r.kind)}`,
                        whiteSpace: 'pre',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        opacity: step >= 2 ? 1 : 0,
                        transition: fade,
                        transitionDelay: step === 2 ? `${ci * 110 + ri * 50}ms` : '0ms',
                      }}
                    >
                      {r.kind === 'more' || r.kind === 'none' ? r.key : show(r.key)}
                    </span>,
                    ...r.hits.map((hit, i) => (
                      <span
                        key={`h${ci}-${ri}-${i}`}
                        onMouseEnter={() => setHover({ r, i })}
                        onClick={() => setHover({ r, i })}
                        style={{
                          cursor: 'pointer',
                          outline:
                            hover && hover.r === r && hover.i === i ? `2px solid ${C.ink}` : 'none',
                          outlineOffset: 1,
                          marginTop: mt,
                          height: 14,
                          borderRadius: 2,
                          background: step >= 3 && hit ? tone(r.kind) : C.grid,
                          opacity: step >= 3 && !m.pass[i] ? 0.3 : 1,
                          transition: 'background .3s ease, opacity .35s ease',
                          transitionDelay: step === 3 ? `${ci * 120 + i * 25}ms` : '0ms',
                        }}
                      />
                    )),
                  ]
                }),
              ]
            })}

            {/* the AND, then the regex */}
            {['kept', 'regex'].map((label) => {
              const at = label === 'kept' ? 3 : 4
              const mt = label === 'kept' ? 10 : 0
              return [
                <span key={`l${label}`} style={{ marginTop: mt }} />,
                <span
                  key={`n${label}`}
                  style={{
                    marginTop: mt,
                    fontFamily: MONO,
                    fontSize: 10.5,
                    fontWeight: 600,
                    color: C.ink,
                    padding: '0 4px',
                    opacity: step >= at ? 1 : 0.3,
                    transition: fade,
                  }}
                >
                  {label}
                </span>,
                ...docs.map((d, i) => {
                  const lit = step >= at && m.pass[i]
                  const ok = m.truth[i]
                  const bg = label === 'kept' ? C.ink : ok ? P.good : P.muted
                  return (
                    <span
                      key={`${label}${i}`}
                      onMouseEnter={() => setHover({ i })}
                      onClick={() => setHover({ i })}
                      style={{
                        marginTop: mt,
                        height: 16,
                        lineHeight: '16px',
                        textAlign: 'center',
                        fontSize: 11,
                        borderRadius: 2,
                        color: C.card,
                        background: lit ? bg : C.grid,
                        transition: 'background .3s ease',
                        transitionDelay: step === at ? `${i * 70}ms` : '0ms',
                      }}
                    >
                      {label === 'regex' && lit ? (ok ? '✓' : '×') : ''}
                    </span>
                  )
                }),
              ]
            })}
          </div>
        </div>
      )}

      {m && m.filterable && (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: C.muted,
            marginTop: 10,
            minHeight: 34,
            lineHeight: 1.5,
            overflowWrap: 'anywhere',
          }}
        >
          {(() => {
            if (!hover) return 'Hover or tap a file or a square to see where its text sits.'
            const d = docs[hover.i]
            // A whole column: where this file holds each chunk, one line per chunk.
            const pairs = hover.r
              ? [[hover.r, hover.r.hits[hover.i] && whereInFile(d, hover.r)]]
              : m.cols.map((c) => {
                  const r = c.rows.find((x) => x.hits[hover.i])
                  return [r || { kind: 'none' }, r && whereInFile(d, r), c]
                })
            return (
              <>
                <div style={{ color: C.ink }}>{d.label}</div>
                {pairs.map(([r, w, c], k) => (
                  <div key={k}>
                    {c && <span style={{ color: C.ink }}>{c.gs.map(show).join(' ')}: </span>}
                    {w ? (
                      <>
                        {w.before}
                        <span
                          style={{
                            color: C.card,
                            background: tone(r.kind),
                            padding: '0 2px',
                            borderRadius: 2,
                          }}
                        >
                          {w.hit}
                        </span>
                        {w.after}
                      </>
                    ) : (
                      'not in this file'
                    )}
                  </div>
                ))}
              </>
            )
          })()}
        </div>
      )}

      <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55, marginTop: 12, minHeight: 38 }}>
        {caption()}
      </div>
    </figure>
  )
}

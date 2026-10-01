import { useTheme } from 'next-themes'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'

import { requiredText, chunksOf, chunkLists, gramView, docTokens } from '../lib/regex-required'
import { chartChrome, vizPalette } from '../lib/viz-palette'

// The hero. It walks what a regex prefilter does on 24 real files: pull out the
// text every match must contain, chop it into chunks, look each chunk up in the
// vocabulary, fetch the posting lists that names, keep the files that pass
// every chunk, and only then run the regex. Every row in the grid is a real
// posting list: a token's BM25 list, or a boundary gram where a chunk crosses
// a token cut. A chunk is never a key itself, so it is drawn as a dashed label. The last
// step is the payoff, so the survivors appear as cards showing why each one
// matched or didn't.
//
// Documents come from public/static/data/regex-filter-hero.json, written by
// experiments/regex-filter/export_hero_data.py out of CodeSearchNet, with GPT-2
// token cuts. Everything is computed live from the pattern, so a reader's own
// search works the same way as the presets.

const DATA_URL = '/static/data/regex-filter-hero.json'
const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
// One lesson each: two pieces that must both appear, an OR inside a group, an
// order the filter can't check, escaped text, and a pattern with no fixed text.
const PRESETS = [
  'def get_\\w*conn',
  '(user|role)_\\w+ = ',
  'user.*role|role.*user',
  '\\bget_\\w+\\(self\\)',
  '\\s+',
]
// How long each step stays up. The fetch and the AND have the most to read.
const STEP_MS = [1400, 2000, 1800, 2600, 2400, 2400, 5200]
const SWEEP_MS = 40
const MAX_CARDS = 6

const STEPS = [
  'A regex search comes in.',
  'Keep only the text every match must contain.',
  'Chop that text into 3-letter chunks.',
  'Look each chunk up in the vocabulary.',
  'Fetch those posting lists, all at once.',
  'Keep the files that are on every list.',
  'Run the real regex on just these files.',
]

const show = (s) => s.replace(/ /g, '·').replace(/\n/g, '⏎')
const fnName = (label) => {
  const m = /def\s+(\w+)/.exec(label)
  const n = m ? m[1] : label
  return n.length > 14 ? `${n.slice(0, 13)}…` : n
}

// One line of a file around a span, trimmed to fit a card.
function lineAround(text, spans) {
  const s0 = spans[0][0]
  const a = text.lastIndexOf('\n', s0 - 1) + 1
  let b = text.indexOf('\n', s0)
  if (b < 0) b = text.length
  let lo = a
  while (lo < s0 && (text[lo] === ' ' || text[lo] === '\t')) lo += 1
  if (s0 - lo > 24) lo = s0 - 18
  const hi = Math.min(b, lo + 72)
  const marks = spans
    .map(([x, y]) => [Math.max(x, lo), Math.min(y, hi)])
    .filter(([x, y]) => y > x)
    .sort((p, q) => p[0] - q[0])
  const parts = []
  let at = lo
  for (const [x, y] of marks) {
    if (x > at) parts.push({ t: text.slice(at, x) })
    if (y > Math.max(x, at)) parts.push({ t: text.slice(Math.max(x, at), y), hl: true })
    at = Math.max(at, y)
  }
  if (hi > at) parts.push({ t: text.slice(at, hi) })
  return { parts, cutLeft: lo > a, cutRight: hi < b }
}

// For a match: the matched text. For a file that got through and failed: where
// each required piece of the branch it passed actually sits, which is usually
// enough to see why the regex said no.
function cardLines(doc, rx, branch) {
  const m = rx ? rx.exec(doc.text) : null
  if (m && m[0].length) return [lineAround(doc.text, [[m.index, m.index + m[0].length]])]
  if (!branch) return []
  const hits = branch
    .map((pc) => {
      const i = doc.text.indexOf(pc.text)
      return i < 0 ? null : [i, i + pc.text.length]
    })
    .filter(Boolean)
  const byLine = new Map()
  for (const h of hits) {
    const a = doc.text.lastIndexOf('\n', h[0] - 1) + 1
    if (!byLine.has(a)) byLine.set(a, [])
    byLine.get(a).push(h)
  }
  return [...byLine.values()].slice(0, 2).map((spans) => lineAround(doc.text, spans))
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
  const [cycle, setCycle] = useState(0)
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
    const t = setTimeout(() => {
      if (step === last) setCycle((c) => c + 1)
      setStep((s) => (s + 1) % STEPS.length)
    }, STEP_MS[step])
    return () => clearTimeout(t)
  }, [step, playing, inView, reduced, last])

  const model = useMemo(() => {
    if (!docs || !docs.length) return null
    const { branches, filterable } = requiredText(query)
    let rx = null
    try {
      rx = new RegExp(query)
    } catch {
      rx = null
    }
    const truth = docs.map((d) => (rx ? rx.test(d.text) : false))
    const kept = new Set()
    const bands = branches.map((pieces) => {
      pieces.forEach((pc) => pc.pos.forEach((p) => kept.add(p)))
      // Chunks that read exactly the same lists (con and onn both read conn,
      // ·conn, ...) are one fetch, so they share one group of rows.
      const groups = new Map()
      pieces.forEach((pc) =>
        chunksOf(pc.text).forEach((_, p) => {
          const c = chunkLists(docs, pc.text, p)
          const sig = c.rows.map((r) => `${r.kind}:${r.key}`).join('\u0000') || `none:${c.g}`
          if (groups.has(sig)) groups.get(sig).gs.push(c.g)
          else groups.set(sig, { ...c, gs: [c.g] })
        })
      )
      const chunks = [...groups.values()]
      const pass = docs.map((_, i) => chunks.every((c) => c.pass[i]))
      return { pieces, chunks, pass }
    })
    const survives = docs.map((_, i) => !filterable || bands.some((b) => b.pass[i]))
    const passedBranch = docs.map((_, i) => bands.find((b) => b.pass[i])?.pieces)
    return { bands, filterable, survives, truth, rx, kept, passedBranch }
  }, [docs, query])

  if (!docs) {
    return (
      <figure style={{ margin: '2rem 0', padding: 16, color: C.muted, fontSize: 12 }}>
        loading the corpus...
      </figure>
    )
  }

  const m = model
  const N = docs.length
  const filterable = m?.filterable
  const nSurv = m ? m.survives.filter(Boolean).length : N
  const nTrue = m ? m.truth.filter(Boolean).length : 0
  const survivors = m ? docs.map((d, i) => ({ d, i })).filter(({ i }) => m.survives[i]) : []
  const allChunks = m ? m.bands.flatMap((b) => b.chunks) : []
  const allRows = allChunks.flatMap((c) => c.rows)
  const nCut = allRows.filter((r) => r.kind === 'gram').length
  const nTok = allRows.filter((r) => r.kind !== 'gram').length
  const nRows = allChunks.reduce((n, c) => n + c.gs.length, 0)
  const shared = allChunks.find((c) => c.gs.length > 1)

  const go = (k) => {
    setStep(Math.max(0, Math.min(last, k)))
    setPlaying(false)
  }
  const pick = (v) => {
    setQuery(v)
    setHover(null)
    setCycle((c) => c + 1)
    if (!reduced) {
      setStep(0)
      setPlaying(true)
    }
  }
  // Typing shows the answer straight away. The rail replays the steps.
  const type = (v) => {
    setQuery(v)
    setHover(null)
    setPlaying(false)
    setStep(last)
  }

  const btn = {
    fontFamily: MONO,
    fontSize: 11,
    height: 26,
    padding: '0 9px',
    cursor: 'pointer',
    border: `1px solid ${C.border}`,
    borderRadius: 2,
    background: 'transparent',
    color: C.muted,
  }

  const tone = (kind) => (kind === 'gram' ? P.series2 : P.series1)
  const cellBg = (hit, kind) => (step < 4 || !hit ? C.grid : tone(kind))
  const dimmed = (band, i) => step >= 5 && !band.pass[i]
  const sweepDelay = (i) => `${i * SWEEP_MS}ms`
  const keepBg = (i) => {
    if (!m || step < 5 || !m.survives[i]) return C.grid
    if (step < 6) return C.ink
    return m.truth[i] ? P.good : P.muted
  }

  const hoverText = () => {
    if (!hover || !m) return null
    const d = docs[hover.col]
    if (hover.row == null) {
      return {
        label: d.label,
        body: m.survives[hover.col]
          ? m.truth[hover.col]
            ? 'passes every chunk, and the regex matches'
            : 'passes every chunk, but the regex finds no match'
          : 'fails a chunk, so the regex never reads it',
      }
    }
    const c = m.bands[hover.band].chunks[hover.chunk]
    const r = c.rows[hover.row]
    const hit = r.hits[hover.col]
    const g = show(c.gs[0])
    if (r.kind === 'gram') {
      return {
        label: d.label,
        body: hit
          ? `“${g}” falls on a cut here, ${gramView(
              d,
              c.gs[0]
            )}, so the boundary gram lists this file`
          : `“${g}” never crosses a cut in this file`,
      }
    }
    const keys = r.kind === 'more' ? r.keys : [r.key]
    const held = hit && keys.filter((k) => docTokens(d).some((x) => x.t === k))
    return {
      label: d.label,
      body: hit
        ? `holds the token ${held.map(show).join(', ')}, so that token’s list has it`
        : `no ${keys.map(show).join(', ')} token in this file`,
    }
  }
  const ht = hoverText()

  const caption = () => {
    if (!m) return ''
    if (step === 0) return 'The pattern as typed. Most of it describes shape, not text.'
    if (!filterable) {
      return `Nothing here is fixed text. Every part can match many strings, so there is nothing to look up and all ${N} files get read.`
    }
    const pieces = m.bands.flatMap((b) => b.pieces.map((p) => p.text))
    const many = m.bands.length > 1
    if (step === 1) {
      return many
        ? `The faded parts can match many strings, so they drop out. A match needs every piece of one group.`
        : `The faded parts can match many strings, so they drop out. A match needs all ${
            pieces.length > 1 ? `${pieces.length} pieces` : 'of this'
          }.`
    }
    if (step === 2) {
      return `${nRows} chunks. They are lookups, not keys: the index has no list for a chunk.`
    }
    if (step === 3) {
      const same = shared
        ? ` ${shared.gs
            .map((g) => show(g))
            .join(' and ')} name the same lists, so they are fetched once.`
        : ''
      return nCut
        ? `The vocabulary names the tokens that hold each chunk and fit the search. Where a chunk falls on a token cut, its boundary gram is a key too.${same}`
        : `The vocabulary names the tokens that hold each chunk and fit the search. Their lists are the keys.${same}`
    }
    if (step === 4) {
      return `${nTok} blue rows are BM25’s own token lists.${
        nCut
          ? ` ${nCut} amber rows are boundary grams, stored only where a chunk crosses a cut.`
          : ' No boundary gram is needed here.'
      }`
    }
    if (step === 5) {
      return `A file must be on some list under every chunk${
        many ? ' of one group' : ''
      }. ${nSurv} of ${N} are. No file has been read yet.`
    }
    return nSurv === nTrue
      ? `The regex ran on ${nSurv} of ${N} files and all ${nTrue} match. Here the chunks alone were exact.`
      : `The regex ran on ${nSurv} of ${N} files and ${nTrue} match. ${
          nSurv - nTrue === 1 ? 'The other one holds' : `The other ${nSurv - nTrue} hold`
        } every piece, in the wrong shape.`
  }

  return (
    <figure
      ref={wrap}
      className="rfp"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.target.tagName === 'INPUT') return
        if (e.key === 'ArrowRight') go(step + 1)
        if (e.key === 'ArrowLeft') go(step - 1)
      }}
      style={{
        margin: '2rem 0',
        border: `1px solid ${C.border}`,
        borderRadius: 3,
        background: C.card,
        overflow: 'hidden',
        outline: 'none',
        textAlign: 'left',
      }}
    >
      <style>{`
        @keyframes rfp-in { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
        @keyframes rfp-slide { from { opacity: 0; transform: translateX(-10px) } to { opacity: 1; transform: none } }
        @keyframes rfp-sweep { 0% { left: 0; opacity: 1 } 92% { opacity: 1 } 100% { left: 100%; opacity: 0 } }
        .rfp-in { animation: rfp-in .28s ease both }
        .rfp-slide { animation: rfp-slide .3s ease both }
        .rfp-grid { display: grid; grid-template-columns: 38px 74px repeat(${N}, minmax(0, 16px)) auto;
          column-gap: 2px; row-gap: 3px; align-items: center; justify-content: start; position: relative; }
        .rfp-vlab { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 9.5px;
          white-space: nowrap; height: 78px; overflow: hidden; text-align: left; line-height: 16px; }
        .rfp-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
        @media (max-width: 560px) {
          .rfp-vlab { height: 0; visibility: hidden }
          .rfp-grid { grid-template-columns: 32px 60px repeat(${N}, minmax(0, 16px)) auto !important }
          .rfp-count { font-size: 9px !important }
        }
        @media (prefers-reduced-motion: reduce) {
          .rfp *, .rfp *::before { animation: none !important; transition: none !important }
        }
      `}</style>

      {/* header and controls */}
      <div
        style={{
          padding: '14px 16px 0',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
            What a regex filter actually does
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            24 real Python functions from CodeSearchNet. Pick a search or type your own.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={btn} onClick={() => go(step - 1)} aria-label="previous step">
            ‹
          </button>
          {!reduced && (
            <button
              style={btn}
              onClick={() => {
                if (!playing && step === last) {
                  setStep(0)
                  setCycle((c) => c + 1)
                }
                setPlaying((x) => !x)
              }}
              aria-label={playing ? 'pause the walkthrough' : 'play the walkthrough'}
            >
              {playing ? 'pause' : 'play'}
            </button>
          )}
          <button style={btn} onClick={() => go(step + 1)} aria-label="next step">
            ›
          </button>
        </div>
      </div>

      {/* step rail: six bars and one caption, which fits a phone */}
      <div style={{ padding: '12px 16px 0' }}>
        <div style={{ display: 'flex', gap: 3 }} role="group" aria-label="steps">
          {STEPS.map((s, k) => (
            <button
              key={s}
              onClick={() => go(k)}
              aria-label={`step ${k + 1}: ${s}`}
              aria-pressed={k === step}
              style={{
                flex: 1,
                height: 14,
                padding: '5px 0',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              <div
                style={{
                  height: 4,
                  borderRadius: 1,
                  background: k <= step ? C.ink : C.grid,
                  opacity: k < step ? 0.35 : 1,
                  transition: 'background .25s ease, opacity .25s ease',
                }}
              />
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: C.ink, marginTop: 4, fontWeight: 500 }}>
          <span style={{ color: C.muted, fontFamily: MONO, fontSize: 11, marginRight: 8 }}>
            {step + 1}/{STEPS.length}
          </span>
          {STEPS[step]}
        </div>
      </div>

      {/* the search box and presets */}
      <div
        style={{
          padding: '12px 16px 0',
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          value={query}
          onChange={(e) => type(e.target.value)}
          spellCheck={false}
          aria-label="search pattern"
          style={{
            fontFamily: MONO,
            fontSize: 13,
            padding: '5px 9px',
            minWidth: 0,
            flex: '1 1 200px',
            color: C.ink,
            background: 'transparent',
            border: `1px solid ${m && !m.rx ? P.bad : C.border}`,
            borderRadius: 2,
          }}
        />
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => pick(p)}
            style={{
              ...btn,
              height: 'auto',
              padding: '4px 7px',
              background: query === p ? C.ink : 'transparent',
              color: query === p ? C.card : C.muted,
              whiteSpace: 'pre',
            }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* the pattern, character by character: what the filter may keep */}
      <div
        key={`lens-${cycle}-${query}`}
        style={{
          padding: '14px 16px 0',
          fontFamily: MONO,
          fontSize: 17,
          letterSpacing: 0.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          minHeight: 26,
        }}
      >
        {[...query].map((ch, i) => {
          const keep = m?.kept.has(i)
          const fade = step >= 1 && !keep
          return (
            <span
              key={i}
              className={step === 0 && !reduced ? 'rfp-in' : undefined}
              style={{
                animationDelay: `${i * 35}ms`,
                color: C.ink,
                opacity: fade ? 0.28 : 1,
                textDecoration: step >= 1 && keep ? 'underline' : 'none',
                textDecorationThickness: 2,
                textUnderlineOffset: 4,
                transition: 'opacity .4s ease',
                transitionDelay: `${i * 18}ms`,
              }}
            >
              {ch === ' ' && step >= 1 && keep ? '·' : ch}
            </span>
          )
        })}
      </div>

      {/* the pieces, then their chunks */}
      <div
        style={{
          padding: '10px 16px 0',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          alignItems: 'center',
          minHeight: 30,
          fontSize: 11,
          color: C.muted,
        }}
      >
        {step >= 1 &&
          m &&
          filterable &&
          m.bands.map((b, bi) => (
            <Fragment key={bi}>
              {bi > 0 && <span style={{ fontFamily: MONO, color: C.ink }}>OR</span>}
              {b.pieces.map((pc, pi) => (
                <Fragment key={pi}>
                  {pi > 0 && <span>and</span>}
                  <span
                    className="rfp-in"
                    style={{
                      display: 'inline-flex',
                      gap: step >= 2 ? 3 : 0,
                      animationDelay: `${(bi * 2 + pi) * 90}ms`,
                      transition: 'gap .3s ease',
                    }}
                  >
                    {step < 2 ? (
                      <code
                        style={{
                          fontFamily: MONO,
                          fontSize: 12,
                          padding: '2px 6px',
                          border: `1px solid ${C.ink}`,
                          borderRadius: 2,
                          color: C.ink,
                          whiteSpace: 'pre',
                        }}
                      >
                        {show(pc.text)}
                      </code>
                    ) : (
                      chunksOf(pc.text).map((g, gi) => (
                        <code
                          key={gi}
                          className="rfp-in"
                          style={{
                            fontFamily: MONO,
                            fontSize: 11,
                            padding: '2px 4px',
                            border: `1px dashed ${C.axis}`,
                            borderRadius: 2,
                            color: C.ink,
                            whiteSpace: 'pre',
                            animationDelay: `${gi * 70}ms`,
                          }}
                        >
                          {show(g)}
                        </code>
                      ))
                    )}
                  </span>
                </Fragment>
              ))}
            </Fragment>
          ))}
      </div>

      {/* the index: one row per chunk, one column per file */}
      {m && filterable && (
        <div style={{ padding: '12px 16px 0', overflowX: 'auto' }}>
          <div className="rfp-grid" onMouseLeave={() => setHover(null)}>
            {/* file names, written up the columns */}
            <span />
            <span />
            {docs.map((d, i) => (
              <span
                key={i}
                className="rfp-vlab"
                style={{
                  fontFamily: MONO,
                  color: hover?.col === i ? C.ink : C.muted,
                  opacity: step >= 5 && !m.survives[i] ? 0.35 : 1,
                  transition: 'opacity .3s ease',
                  transitionDelay: step >= 5 ? sweepDelay(i) : '0ms',
                }}
              >
                {fnName(d.label)}
              </span>
            ))}
            <span />

            {m.bands.map((band, bi) => (
              <Fragment key={bi}>
                {bi > 0 && (
                  <>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        color: C.ink,
                        textAlign: 'right',
                        paddingTop: 4,
                      }}
                    >
                      OR
                    </span>
                    <span
                      style={{
                        gridColumn: `2 / span ${N + 1}`,
                        borderTop: `1px dashed ${C.axis}`,
                        marginTop: 4,
                      }}
                    />
                    <span />
                  </>
                )}
                {band.chunks.map((c, ci) => {
                  const rows = c.rows.length
                    ? c.rows
                    : [{ kind: 'none', key: 'no list', hits: docs.map(() => false) }]
                  // One chunk label per row; if a group has more chunks than rows,
                  // the last label counts the rest.
                  const labels =
                    c.gs.length <= rows.length
                      ? c.gs
                      : [...c.gs.slice(0, rows.length - 1), `+${c.gs.length - rows.length + 1}`]
                  return rows.map((r, ri) => {
                    const nHit = r.hits.filter(Boolean).length
                    const on = step >= 3
                    const gap = ri === 0 && ci > 0 ? 6 : 0
                    const delay = `${ci * 110 + ri * 50}ms`
                    return (
                      <Fragment key={`${bi}-${ci}-${ri}`}>
                        {/* the chunk: a lookup, drawn dashed because nothing is keyed by it */}
                        {labels[ri] ? (
                          <code
                            className={step >= 2 ? 'rfp-slide' : undefined}
                            style={{
                              justifySelf: 'end',
                              fontFamily: MONO,
                              fontSize: 10.5,
                              color: C.muted,
                              whiteSpace: 'pre',
                              padding: '0 3px',
                              border: `1px dashed ${C.axis}`,
                              borderRadius: 2,
                              marginTop: gap,
                              opacity: step >= 2 ? 1 : 0,
                              animationDelay: `${ci * 60}ms`,
                            }}
                          >
                            {labels[ri].startsWith('+') && c.gs.length > rows.length
                              ? labels[ri]
                              : show(labels[ri])}
                          </code>
                        ) : (
                          <span />
                        )}
                        {/* the key: a real posting list */}
                        <code
                          className={on ? 'rfp-slide' : undefined}
                          title={r.kind === 'more' ? r.keys.map(show).join(' ') : undefined}
                          style={{
                            justifySelf: 'end',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            fontFamily: MONO,
                            fontSize: 10.5,
                            color: r.kind === 'none' ? C.muted : C.ink,
                            whiteSpace: 'pre',
                            padding: '0 4px',
                            marginTop: gap,
                            borderLeft: r.kind === 'none' ? 'none' : `3px solid ${tone(r.kind)}`,
                            opacity: on ? 1 : 0,
                            animationDelay: delay,
                          }}
                        >
                          {r.kind === 'more' || r.kind === 'none' ? r.key : show(r.key)}
                        </code>
                        {r.hits.map((hit, i) => (
                          <span
                            key={i}
                            onMouseEnter={() =>
                              r.kind !== 'none' &&
                              setHover({ band: bi, chunk: ci, row: ri, col: i })
                            }
                            onClick={() =>
                              r.kind !== 'none' &&
                              setHover({ band: bi, chunk: ci, row: ri, col: i })
                            }
                            style={{
                              height: 12,
                              marginTop: gap,
                              borderRadius: 1,
                              cursor: 'pointer',
                              background: on ? cellBg(hit, r.kind) : 'transparent',
                              opacity: dimmed(band, i) ? 0.22 : 1,
                              outline:
                                hover?.col === i &&
                                hover?.row === ri &&
                                hover?.chunk === ci &&
                                hover?.band === bi
                                  ? `2px solid ${C.ink}`
                                  : 'none',
                              outlineOffset: 1,
                              transition: 'background .25s ease, opacity .3s ease',
                              transitionDelay:
                                step === 4
                                  ? `${i * 18 + ci * 40}ms`
                                  : step >= 5
                                  ? sweepDelay(i)
                                  : '0ms',
                            }}
                          />
                        ))}
                        <span
                          className="rfp-count"
                          style={{
                            fontFamily: MONO,
                            fontSize: 10,
                            marginTop: gap,
                            color: r.kind === 'gram' ? P.series2 : C.muted,
                            paddingLeft: 6,
                            whiteSpace: 'nowrap',
                            opacity: step >= 4 ? 1 : 0,
                            transition: 'opacity .3s ease .5s',
                          }}
                        >
                          {nHit}
                        </span>
                      </Fragment>
                    )
                  })
                })}
              </Fragment>
            ))}

            {/* the AND: files on every list of some row */}
            <span
              style={{
                gridColumn: `1 / span ${N + 3}`,
                borderTop: `1px solid ${C.border}`,
                marginTop: 4,
              }}
            />
            <span />
            <code
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                fontWeight: 600,
                color: C.ink,
                textAlign: 'right',
                paddingRight: 4,
              }}
            >
              keep
            </code>
            {docs.map((d, i) => (
              <span
                key={i}
                onMouseEnter={() => setHover({ col: i })}
                onClick={() => setHover({ col: i })}
                style={{
                  height: 13,
                  borderRadius: 1,
                  cursor: 'pointer',
                  background: keepBg(i),
                  transition: 'background .3s ease',
                  transitionDelay: step === 5 ? sweepDelay(i) : step === 6 ? `${i * 15}ms` : '0ms',
                }}
              />
            ))}
            <span
              className="rfp-count"
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: C.ink,
                paddingLeft: 6,
                whiteSpace: 'nowrap',
                opacity: step >= 5 ? 1 : 0,
                transition: 'opacity .3s ease',
                transitionDelay: step === 5 ? `${N * SWEEP_MS}ms` : '0ms',
              }}
            >
              {nSurv} left
            </span>

            {/* the AND sweeping across the columns */}
            {step === 5 && !reduced && (
              <span
                key={`sweep-${cycle}`}
                aria-hidden
                style={{
                  position: 'absolute',
                  gridColumn: `3 / span ${N}`,
                  top: 0,
                  bottom: 0,
                  left: 0,
                  right: 0,
                  pointerEvents: 'none',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    width: 2,
                    marginLeft: -1,
                    background: C.ink,
                    animation: `rfp-sweep ${N * SWEEP_MS}ms linear both`,
                  }}
                />
              </span>
            )}
          </div>

          {/* what's under the pointer */}
          <div
            style={{
              fontSize: 11,
              color: C.muted,
              marginTop: 8,
              minHeight: 32,
              lineHeight: 1.45,
            }}
          >
            {ht ? (
              <>
                <code style={{ fontFamily: MONO, color: C.ink }}>{ht.label}</code>
                {ht.body && <div style={{ fontFamily: MONO, fontSize: 10.5 }}>{ht.body}</div>}
              </>
            ) : (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
                <span>
                  <Swatch c={P.series1} /> a token&rsquo;s BM25 list
                </span>
                <span>
                  <Swatch c={P.series2} /> a boundary gram, stored only at a token cut
                </span>
                <span>hover or tap a square to see why</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* the caption for this step */}
      <div
        key={`cap-${step}-${query}`}
        className="rfp-in"
        style={{
          padding: '10px 16px 0',
          fontSize: 12,
          color: C.ink,
          lineHeight: 1.55,
          minHeight: 38,
        }}
      >
        {caption()}
      </div>

      {/* the regex runs only on the survivors */}
      <div
        style={{
          margin: '12px 0 0',
          padding: '12px 16px 14px',
          borderTop: `1px solid ${C.border}`,
          minHeight: 92,
        }}
      >
        {!filterable && m ? (
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
            Every index in this post fails the same way here. A filter can only look up fixed text,
            and <code style={{ fontFamily: MONO, color: C.ink }}>{query}</code> names none.
          </div>
        ) : step < 6 ? (
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
            Nothing is read from any file until the last step. The lists answer everything before
            it.
          </div>
        ) : (
          <div className="rfp-cards">
            {survivors.slice(0, MAX_CARDS).map(({ d, i }, k) => {
              const ok = m.truth[i]
              const lines = cardLines(d, m.rx, m.passedBranch[i])
              return (
                <div
                  key={`${cycle}-${i}`}
                  className="rfp-in"
                  onMouseEnter={() => setHover({ col: i })}
                  style={{
                    animationDelay: `${k * 130}ms`,
                    border: `1px solid ${ok ? P.good : C.border}`,
                    borderLeftWidth: 3,
                    borderRadius: 2,
                    padding: '6px 8px',
                    minWidth: 0,
                    outline: hover?.col === i ? `1px solid ${C.ink}` : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 8,
                      fontSize: 10.5,
                      fontFamily: MONO,
                    }}
                  >
                    <span
                      style={{
                        color: C.ink,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {d.label}
                    </span>
                    <span style={{ color: ok ? P.good : P.muted, flex: '0 0 auto' }}>
                      {ok ? 'match' : 'no match'}
                    </span>
                  </div>
                  {lines.map((ln, li) => (
                    <div
                      key={li}
                      style={{
                        fontFamily: MONO,
                        fontSize: 10.5,
                        color: C.muted,
                        whiteSpace: 'pre',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        marginTop: 4,
                      }}
                    >
                      {ln.cutLeft && '…'}
                      {ln.parts.map((p, pi) =>
                        p.hl ? (
                          <span
                            key={pi}
                            style={{
                              color: C.ink,
                              background: ok ? `${P.good}33` : 'transparent',
                              borderBottom: `1.5px ${ok ? 'solid' : 'dashed'} ${
                                ok ? P.good : P.muted
                              }`,
                            }}
                          >
                            {p.t}
                          </span>
                        ) : (
                          <span key={pi}>{p.t}</span>
                        )
                      )}
                      {ln.cutRight && '…'}
                    </div>
                  ))}
                </div>
              )
            })}
            {survivors.length > MAX_CARDS && (
              <div style={{ fontSize: 11, color: C.muted, alignSelf: 'center' }}>
                and {survivors.length - MAX_CARDS} more files
              </div>
            )}
          </div>
        )}
      </div>
    </figure>
  )
}

function Swatch({ c }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 10,
        height: 10,
        borderRadius: 1,
        background: c,
        verticalAlign: -1,
      }}
    />
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { LABEL, MONO, cardStyle, hexFade } from '../lib/wordpiece-lab'
import { useChrome } from '../lib/cheap-rewriter'

/*
 * Grounded expansion in six scenes, on one real query (`perdoc.q`, set by PERDOC_Q
 * in export_blog.py). Every number is real: BM25's top 10, the Haiku passage and
 * which of its words the top docs share, the 6-layer model's per-doc scores, its
 * top picks at weight 2p, the ranking after the second BM25 pass, and the two
 * latencies (2-layer model on a 4-core CPU, LLM model call estimated from the CLI).
 * Data: `perdoc` in cheap-rewriter.json, from research/query-rewriter/qrw/export_blog.py.
 *
 * Plays once when scrolled into view, then stops on the last scene. Step dots,
 * prev/next, play/pause and the arrow keys navigate. prefers-reduced-motion shows
 * each scene's final frame with no motion.
 */

const SCENES = [
  { key: 'search', label: 'search', ms: 3800 },
  { key: 'llm', label: 'the LLM writes', ms: 5200 },
  { key: 'overlap', label: 'the overlap', ms: 4200 },
  { key: 'read', label: 'read the docs', ms: 5200 },
  { key: 'rerank', label: 'search again', ms: 4600 },
  { key: 'cost', label: 'the cost', ms: 4200 },
]

// the steps a reader sees. Scenes 1 and 2 (the LLM passage and its overlap with the docs) are
// kept in the code but not shown: the method itself has no LLM in it.
const STEPS = [0, 3, 4, 5]

const ORD = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th')

// captions come from the data, so the animation stays true if the example query changes
const captions = (x, A, cost) => {
  const counts = A.doc_counts
  const relC = counts[x.rel[0]]
  const other = Math.max(...counts.filter((_, i) => i !== x.rel[0]))
  const n = A.nd_q
  return [
    `BM25 finds the right doc, but ranks it ${ORD(x.rel[0] + 1)}.`,
    'An LLM writes a passage from the query alone. It never sees the docs.',
    relC > other
      ? `Many of its words are already in the results, and the right doc holds the most. It has ${relC}, against ${other} for the next one.`
      : `Many of its words are already in the results. The right doc holds ${relC}, but another holds ${other}, so counting alone can’t pick it out.`,
    'A small model reads the query next to each doc and scores every word in it. The same word scores high in one doc and low in another.',
    `Its best words join the query, and BM25 runs again. The right doc moves to rank ${x.new_rank_of_rel[0]}.`,
    `On this query the LLM takes about ${(cost.llm / 1000).toFixed(0)} s to reach ${n.llm.toFixed(
      0
    )}. The 6-layer model reaches ${n.large.toFixed(0)} in ${cost.large.toFixed(
      0
    )} ms, and the 2-layer one ${n.small.toFixed(0)} in ${cost.small.toFixed(0)} ms.`,
  ]
}

const ROW = 34
const ROW_M = 27
const SHOW = 6

export default function GroundedExpansionAnim({ data: x, cost }) {
  const c = useChrome()
  const A = x.anim
  const rel = x.rel[0]
  const [step, setStep] = useState(0)
  const scene = STEPS[step]
  const [prog, setProg] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const started = useRef(false)
  const box = useRef(null)
  const raf = useRef(0)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const apply = () => setNarrow(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // play once, the first time the figure is on screen
  useEffect(() => {
    const node = box.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !started.current) {
          started.current = true
          setPlaying(true)
        }
      },
      { threshold: 0.35 }
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (reduced) {
      setProg(1)
      return
    }
    if (!playing) return
    let last = null
    const tick = (ts) => {
      if (last == null) last = ts
      const dt = ts - last
      last = ts
      setProg((p) => {
        const np = Math.min(1, p + dt / SCENES[scene].ms)
        return np
      })
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, scene, reduced])

  // advance when a scene finishes, stop on the last one
  useEffect(() => {
    if (!playing || prog < 1) return
    if (step < STEPS.length - 1) {
      setStep(step + 1)
      setProg(0)
    } else setPlaying(false)
  }, [prog, playing, step])

  const go = useCallback(
    (i) => {
      const n = Math.max(0, Math.min(STEPS.length - 1, i))
      setStep(n)
      setProg(reduced ? 1 : 0)
    },
    [reduced]
  )
  const onKey = (e) => {
    if (e.key === 'ArrowRight') go(step + 1)
    if (e.key === 'ArrowLeft') go(step - 1)
  }

  // ---- derived per-scene state
  const done = (k) => scene > k || (scene === k && prog >= 1)
  const nWords = A.passage.length
  const typed = scene < 1 ? 0 : scene === 1 ? Math.floor(nWords * Math.min(1, prog * 1.15)) : nWords
  const colored = scene >= 2
  const countP = scene < 2 ? 0 : scene === 2 ? Math.min(1, prog * 1.6) : 1
  const scanRow = scene < 3 ? -1 : scene === 3 ? Math.floor(Math.min(1, prog * 1.25) * 10) : 10
  const reranked = scene >= 4 && (scene > 4 || prog > 0.25)
  const nd =
    scene < 4
      ? x.nd[0]
      : scene === 4
      ? x.nd[0] + (x.nd[1] - x.nd[0]) * Math.min(1, Math.max(0, (prog - 0.25) / 0.5))
      : x.nd[1]
  const watch = A.watch
  const CAPTIONS = captions(x, A, cost)

  // rows: the 10 original docs, plus docs the second pass brings in from outside the top 10
  const rows = x.docs.map((t, i) => ({ id: `d${i}`, title: t, orig: i }))
  A.after.forEach((a, k) => {
    if (a.was == null) rows.push({ id: `n${k}`, title: a.title, orig: null })
  })
  const afterPos = {}
  A.after.forEach((a, k) => {
    afterPos[a.was == null ? `n${k}` : `d${a.was - 1}`] = k
  })
  const pos = (r) => (reranked ? afterPos[r.id] : r.orig)
  const rowH = narrow ? ROW_M : ROW
  const listH = rowH * 10

  const tone = {
    docs: { background: hexFade(c.picker, 0.24), borderRadius: 3, padding: '0 2px' },
    llm: { color: c.llm, textDecoration: 'underline dotted', textUnderlineOffset: 3 },
    query: { fontWeight: 700 },
  }
  const trans = reduced
    ? 'none'
    : 'top 900ms cubic-bezier(.2,.8,.2,1), opacity 500ms, background 500ms'

  return (
    <div
      ref={box}
      style={{ ...cardStyle(c), outline: 'none' }}
      tabIndex={0}
      onKeyDown={onKey}
      role="figure"
      aria-label="Grounded expansion, step by step"
    >
      {/* query bar */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 6,
          border: `1px solid ${c.border}`,
          borderRadius: 6,
          padding: '7px 10px',
          marginBottom: 10,
          background: c.lane,
        }}
      >
        <span style={{ ...LABEL, color: c.muted }}>query</span>
        <span style={{ fontSize: 14, color: c.ink }}>{x.q}</span>
        {A.picks.slice(0, SHOW).map(([w, wt], i) => (
          <span
            key={w}
            style={{
              fontFamily: MONO,
              fontSize: 10.5 + 1.5 * wt,
              color: c.ink,
              background: hexFade(c.picker, 0.3),
              borderRadius: 4,
              padding: '1px 6px',
              opacity: reranked ? 1 : 0,
              transform: reranked ? 'none' : 'translateY(8px)',
              transition: reduced
                ? 'none'
                : `opacity 400ms ${i * 60}ms, transform 400ms ${i * 60}ms`,
            }}
          >
            +{w}
          </span>
        ))}
        {reranked && (
          <span style={{ fontFamily: MONO, fontSize: 11, color: c.muted }}>
            +{A.picks.length > SHOW ? 20 - SHOW : 0} more
          </span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: MONO,
            fontSize: 12,
            color: nd > 99 ? c.good : c.muted,
          }}
        >
          nDCG@10 {nd.toFixed(1)}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
          gap: 14,
        }}
      >
        {/* the ranked docs */}
        <div>
          <div style={{ ...LABEL, color: c.muted, marginBottom: 6 }}>
            {reranked ? 'BM25 results, second search' : 'BM25 results'}
          </div>
          <div style={{ position: 'relative', height: listH }}>
            {rows.map((r) => {
              const p = pos(r)
              const shown =
                p != null &&
                (scene >= 1 || prog * 10 > r.orig - 0.5 || reduced) &&
                !(r.orig == null && !reranked)
              const isRel = r.orig === rel
              const cnt = r.orig != null ? Math.round(A.doc_counts[r.orig] * countP) : 0
              const maxC = Math.max(...A.doc_counts)
              const scanned = r.orig != null && scanRow >= r.orig && scene === 3
              const chip =
                watch &&
                r.orig != null &&
                watch.cells[r.orig] != null &&
                scanRow >= r.orig &&
                scene === 3
              return (
                <div
                  key={r.id}
                  style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    top: (p == null ? 10 : p) * rowH,
                    height: rowH - 4,
                    opacity: shown ? 1 : 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 8px',
                    borderRadius: 5,
                    border: `1px solid ${isRel && scene >= 0 ? c.good : c.grid}`,
                    background:
                      scene === 2 && r.orig != null
                        ? hexFade(c.picker, 0.05 + 0.45 * (cnt / maxC))
                        : scanned
                        ? hexFade(c.picker, 0.12)
                        : 'transparent',
                    transition: trans,
                    fontSize: 12.5,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      width: 22,
                      color: isRel ? c.good : c.muted,
                    }}
                  >
                    #{(p ?? 0) + 1}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      color: isRel ? c.ink : c.muted,
                    }}
                  >
                    {r.orig == null && reranked && (
                      <b style={{ color: c.picker, marginRight: 4 }}>new</b>
                    )}
                    {narrow ? r.title.split(' ').slice(0, 4).join(' ') + '…' : r.title}
                  </span>
                  {scene === 2 && r.orig != null && (
                    <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: c.ink }}>
                      {cnt}
                    </span>
                  )}
                  {chip && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        borderRadius: 4,
                        padding: '1px 5px',
                        color: c.ink,
                        background: hexFade(c.picker, 0.15 + 0.7 * watch.cells[r.orig]),
                      }}
                    >
                      {watch.w} {watch.cells[r.orig].toFixed(2).replace(/^0/, '')}
                    </span>
                  )}
                  {isRel && <span style={{ fontSize: 10.5, color: c.good }}>relevant</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* the right-hand panel changes with the scene */}
        <div style={{ minWidth: 0 }}>
          {(scene === 3 || scene === 4) && (
            <div>
              <div style={{ ...LABEL, color: c.picker, marginBottom: 6 }}>
                grounded expansion · reads each returned doc
              </div>
              <div style={{ fontSize: 13, color: c.muted, lineHeight: 1.55, marginBottom: 10 }}>
                It was trained on LLM passages to mark the words an answer would use. It reads the
                query next to each doc and scores every word in it.
                {scene === 3 &&
                  ` Watch "${watch.w}": ${watch.cells[x.rel[0]]
                    .toFixed(2)
                    .replace(/^0/, '')} in the right doc, ${watch.cells[watch.lo_rank - 1]
                    .toFixed(2)
                    .replace(/^0/, '')} in the ${watch.lo_label} at #${watch.lo_rank}.`}
              </div>
              {scene === 4 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {A.picks.slice(0, SHOW).map(([w, wt]) => (
                    <span
                      key={w}
                      style={{
                        fontFamily: MONO,
                        fontSize: 12,
                        borderRadius: 4,
                        padding: '2px 7px',
                        color: c.ink,
                        background: hexFade(c.picker, 0.15 + 0.35 * (wt / 2)),
                      }}
                    >
                      {w} {(wt / 2).toFixed(2).replace(/^0/, '')}
                    </span>
                  ))}
                  <div style={{ fontSize: 11.5, color: c.muted, width: '100%', marginTop: 4 }}>
                    its top {SHOW} of 20 words and how sure the model is about each. All 20 join the
                    query, each with weight 2 × that score. “new” marks a doc that was not in the
                    first top 10.
                  </div>
                </div>
              )}
            </div>
          )}
          {scene === 5 && (
            <div>
              <div style={{ ...LABEL, color: c.muted, marginBottom: 10 }}>
                time per query, to scale
              </div>
              {[
                [
                  'BM25',
                  cost.bm25,
                  c.muted,
                  `${cost.bm25.toFixed(2)} ms (too small to see) · nDCG ${x.nd[0].toFixed(0)}`,
                ],
                [
                  'LLM rewrite',
                  cost.llm,
                  c.llm,
                  `about ${(cost.llm / 1000).toFixed(1)} s · nDCG ${A.nd_q.llm.toFixed(0)}`,
                ],
                [
                  'grounded expansion, 6-layer',
                  cost.large,
                  c.picker,
                  `${cost.large.toFixed(0)} ms · nDCG ${A.nd_q.large.toFixed(0)}`,
                ],
                [
                  'grounded expansion, 2-layer',
                  cost.small,
                  c.picker,
                  `${cost.small.toFixed(0)} ms (too small to see) · nDCG ${A.nd_q.small.toFixed(
                    0
                  )}`,
                ],
              ].map(([name, ms, col, lab]) => {
                // linear on purpose: at this scale 24 ms is a sliver next to 5 s
                const w = (ms / cost.llm) * 55
                return (
                  <div key={name} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12.5, color: c.ink, marginBottom: 3 }}>{name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          height: 14,
                          borderRadius: 3,
                          background: col,
                          width: `${reduced ? w : w * Math.min(1, prog * 1.6)}%`,
                          minWidth: 3,
                        }}
                      />
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 12,
                          color: c.ink,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {lab}
                      </span>
                    </div>
                  </div>
                )
              })}
              <div style={{ fontSize: 11.5, color: c.muted }}>
                nDCG@10 on this query. Averaged over 649 queries the 2-layer version gains +2.05 and
                the 6-layer +2.96.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* caption + controls */}
      <div style={{ fontSize: 14, color: c.ink, marginTop: 12, minHeight: 42, lineHeight: 1.45 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, color: c.picker, marginRight: 8 }}>
          {step + 1}/{STEPS.length}
        </span>
        {CAPTIONS[scene]}
      </div>
      <div
        style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 8 }}
      >
        <button onClick={() => go(step - 1)} style={btn(c)} aria-label="previous step">
          ←
        </button>
        <button
          onClick={() => {
            if (step === STEPS.length - 1 && done(scene)) go(0)
            setPlaying((v) => !v || (step === STEPS.length - 1 && done(scene)))
          }}
          style={btn(c)}
          aria-label={playing ? 'pause' : 'play'}
        >
          {playing ? 'pause' : step === STEPS.length - 1 && done(scene) ? 'replay' : 'play'}
        </button>
        <button onClick={() => go(step + 1)} style={btn(c)} aria-label="next step">
          →
        </button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginLeft: 6 }}>
          {STEPS.map((k, i) => (
            <button
              key={SCENES[k].key}
              onClick={() => go(i)}
              style={{
                ...btn(c),
                fontSize: 11,
                padding: '3px 7px',
                color: i === step ? c.bg || '#000' : c.muted,
                background: i === step ? c.picker : 'transparent',
                borderColor: i === step ? c.picker : c.border,
              }}
            >
              {narrow ? i + 1 : `${i + 1}. ${SCENES[k].label}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

const btn = (c) => ({
  fontFamily: MONO,
  fontSize: 12,
  padding: '3px 9px',
  borderRadius: 4,
  border: `1px solid ${c.border}`,
  background: 'transparent',
  color: c.ink,
  cursor: 'pointer',
})

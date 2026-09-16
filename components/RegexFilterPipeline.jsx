import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

import { chartChrome, vizPalette } from '../lib/viz-palette'

// The whole process, animated: a regex arrives, the fixed text is pulled out of
// it, that text is chopped into pieces, each piece is looked up, the surviving
// documents are intersected, and the real regex runs on whatever is left.
//
// Every number here is real. 60 documents sampled from CodeSearchNet Python,
// the query /get_user\w*/, and the per-document bits below say which pieces
// each document actually contains. Four documents really match.
//
// The token lane is the interesting one: it finds two of the four, because
// `self.get_user_roles()` tokenises the piece as ".get" and `_get_user_ids(`
// as "get", neither of which is the " get" the query produces. That is not a
// flaw in the drawing, it is the reason the adjacency index exists.

// bit 0 = truly matches, bits 1-6 = trigrams get/et_/t_u/_us/use/ser,
// bits 7-8 = tokens " get" / "_user"
// prettier-ignore
const TILES = [
  '000000000', '000000000', '010000010', '011000000', '000001100', '000001000', '000000000', '011000010', '000000000', '010001000',
  '011001110', '011001110', '011001000', '010000000', '001000000', '000001100', '010000000', '011001000', '011001110', '000000000',
  '000000000', '000000000', '000000000', '011011111', '011000010', '010001100', '000000000', '011001110', '000000000', '011000100',
  '111111111', '111111101', '011101110', '111111111', '011001110', '000000000', '010000000', '111111101', '000000100', '011101110',
  '011001100', '000000000', '010001110', '011001100', '000001000', '000000000', '010000110', '000101100', '000000000', '011001110',
  '010001110', '011000000', '010000100', '000000000', '000000000', '000000000', '000000000', '000000000', '000000000', '011000100',
]

const REGEX = '/get_user\\w*/'
const LITERAL = 'get_user'

const LANES = {
  trigram: {
    label: '3-char chunks',
    pieces: ['get', 'et_', 't_u', '_us', 'use', 'ser'],
    bit: (t, i) => t[1 + i] === '1',
    sound: true,
    verdict: 'All 4 found. 6 lookups.',
    unit: 'chunks:',
    note: 'Slide along one character at a time and require every chunk. Sound, and it needs six lookups.',
  },
  naive: {
    label: 'tokens alone (broken)',
    pieces: ['\u00b7get', '_user'],
    bit: (t, i) => t[7 + i] === '1',
    sound: false,
    unit: 'tokens:',
    verdict: 'Only 2 of 4 found. Unusable.',
    note: 'Look the query\u2019s own tokens up and nothing else. Two lookups, and it drops real matches.',
  },
  bigram: {
    label: 'tokens + adjacency',
    pieces: ['get', 'et_', 't_u', '_us', 'use', 'ser'],
    bit: (t, i) => t[1 + i] === '1',
    unit: 'chunks:',
    resolve: true,
    sound: true,
    verdict: 'All 4 found, from the BM25 index.',
    note: 'Ask which documents hold each chunk, answered by the tokens that contain it plus the token pairs that spell it across a boundary. Same result as the first lane, no separate index.',
  },
}

const MISSES = [
  { code: 'def get_user_roles(', piece: '·get', ok: true },
  { code: 'self.get_user_roles(', piece: '.get', ok: false },
  { code: '_get_user_ids(', piece: 'get', ok: false },
]

const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'

// stage boundaries as fractions of the cycle
const CYCLE_MS = 11000
const HOLD_MS = 2600

export default function RegexFilterPipeline() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const C = chartChrome(dark)
  const P = vizPalette(dark)

  const [lane, setLane] = useState('bigram')
  const [progress, setProgress] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [inView, setInView] = useState(false)
  const wrap = useRef(null)
  const raf = useRef(null)
  const last = useRef(null)
  const clock = useRef(0)
  const live = useRef(false)

  // Only animate while on screen, so it never runs in a background tab.
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

  const shouldPlay = playing && inView
  useEffect(() => {
    live.current = shouldPlay
  }, [shouldPlay])

  useEffect(() => {
    if (!shouldPlay) return undefined
    const total = CYCLE_MS + HOLD_MS
    const step = (ts) => {
      if (!live.current) return
      if (last.current == null) last.current = ts
      clock.current = (clock.current + (ts - last.current)) % total
      last.current = ts
      setProgress(clock.current < CYCLE_MS ? clock.current / CYCLE_MS : 1)
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(raf.current)
      last.current = null
    }
  }, [shouldPlay])

  const L = LANES[lane]
  const n = L.pieces.length

  // Timeline: query 0-.12, extract .12-.24, chop .24-.36, lookups .36-.84, verify .84-1
  const p = progress
  const stage = p < 0.12 ? 0 : p < 0.24 ? 1 : p < 0.36 ? 2 : p < 0.84 ? 3 : 4
  const lookupT = Math.max(0, Math.min(1, (p - 0.36) / 0.48))
  const done = Math.min(n, Math.floor(lookupT * n + 1e-9)) // pieces fully applied
  const activeIdx = stage === 3 ? Math.min(n - 1, Math.floor(lookupT * n)) : -1

  // Which tiles survive after `done` pieces
  const survives = (t, k) => {
    for (let j = 0; j < k; j += 1) if (!L.bit(t, j)) return false
    return true
  }
  const alive = TILES.map((t) => (stage < 3 ? true : survives(t, done)))
  const nAlive = alive.filter(Boolean).length
  const nTrue = TILES.filter((t) => t[0] === '1').length
  const foundTrue = TILES.filter((t, i) => t[0] === '1' && alive[i]).length

  const STAGES = [
    'a regex arrives',
    'pull out the fixed text',
    'chop it into pieces',
    `look each piece up (${Math.min(done + (activeIdx >= 0 ? 0 : 0), n)}/${n})`,
    'run the real regex on what is left',
  ]

  const tileColor = (t, i) => {
    if (!alive[i]) return dark ? '#141922' : '#eef1f6'
    if (stage === 4) return t[0] === '1' ? P.good : P.bad
    return P.muted
  }

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
          padding: '14px 16px 10px',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
            How a regex filter narrows 60 documents to 4
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
            Real documents from CodeSearchNet, real piece-by-piece containment.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0 }}>
          {Object.entries(LANES).map(([k, v], idx) => (
            <button
              key={k}
              onClick={() => {
                setLane(k)
                clock.current = 0
                setProgress(0)
              }}
              style={{
                fontFamily: MONO,
                fontSize: 11,
                padding: '4px 9px',
                cursor: 'pointer',
                border: `1px solid ${C.border}`,
                borderRight: idx === 2 ? `1px solid ${C.border}` : 'none',
                background: k === lane ? C.ink : 'transparent',
                color: k === lane ? C.card : C.muted,
              }}
            >
              {v.label}
            </button>
          ))}
          <button
            onClick={() => setPlaying((x) => !x)}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              padding: '4px 9px',
              marginLeft: 6,
              cursor: 'pointer',
              border: `1px solid ${C.border}`,
              background: 'transparent',
              color: C.muted,
            }}
          >
            {playing ? 'pause' : 'play'}
          </button>
        </div>
      </div>

      {/* stage rail */}
      <div style={{ display: 'flex', gap: 0, padding: '0 16px 10px' }}>
        {STAGES.map((s, k) => (
          <div key={s} style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                height: 2,
                background: k <= stage ? (k === stage ? C.ink : P.muted) : C.grid,
                marginBottom: 5,
              }}
            />
            <div
              style={{
                fontSize: 9.5,
                lineHeight: 1.25,
                color: k === stage ? C.ink : C.muted,
                opacity: k <= stage ? 1 : 0.5,
                paddingRight: 6,
              }}
            >
              {s}
            </div>
          </div>
        ))}
      </div>

      {/* query + pieces */}
      <div style={{ padding: '4px 16px 0', minHeight: 74 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontFamily: MONO, fontSize: 14, color: C.ink }}>
            {stage === 0 ? (
              REGEX
            ) : (
              <>
                <span style={{ color: C.muted }}>/</span>
                <span
                  style={{
                    color: stage >= 1 ? P.good : C.ink,
                    background: stage >= 1 ? (dark ? '#0f2a1e' : '#e7f5ee') : 'transparent',
                    padding: '1px 2px',
                  }}
                >
                  {LITERAL}
                </span>
                <span style={{ color: C.muted }}>\w*/</span>
              </>
            )}
          </span>
          {stage >= 1 && (
            <span style={{ fontSize: 11, color: C.muted }}>
              {stage === 1 ? '\\w* could be anything, so only get_user is guaranteed present' : ''}
            </span>
          )}
        </div>

        {stage >= 2 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 5,
              alignItems: 'center',
              marginTop: 9,
            }}
          >
            <span style={{ fontSize: 10.5, color: C.muted, marginRight: 2 }}>{L.unit}</span>
            {L.pieces.map((pc, k) => {
              const used = stage > 3 || k < done
              const now = k === activeIdx && stage === 3
              return (
                <span
                  key={pc}
                  style={{
                    fontFamily: MONO,
                    fontSize: 11.5,
                    padding: '3px 7px',
                    border: `1px solid ${now ? C.ink : used ? P.muted : C.border}`,
                    borderRadius: 2,
                    background: now ? C.ink : 'transparent',
                    color: now ? C.card : used ? C.ink : C.muted,
                    whiteSpace: 'pre',
                    transition: 'all .18s ease',
                  }}
                >
                  {pc}
                </span>
              )
            })}
          </div>
        )}
      </div>

      {L.resolve && stage >= 3 && (
        <div style={{ padding: '9px 16px 0' }}>
          <div
            style={{
              fontSize: 10.5,
              color: C.muted,
              lineHeight: 1.7,
              borderLeft: `2px solid ${C.border}`,
              paddingLeft: 9,
            }}
          >
            The chunks are the query unit, the token index is the storage. Each chunk is answered by{' '}
            <span style={{ fontFamily: MONO, color: C.ink }}>tokens whose text contains it</span> or{' '}
            <span style={{ fontFamily: MONO, color: C.ink }}>
              token pairs that spell it across a boundary
            </span>
            , so there is no chunk index to store.
          </div>
        </div>
      )}

      {/* the corpus */}
      <div style={{ padding: '12px 16px 0' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: C.muted,
            marginBottom: 6,
          }}
        >
          <span>60 documents</span>
          <span style={{ fontFamily: MONO, color: C.ink }}>
            {stage < 3 ? 60 : nAlive} still possible
          </span>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(20, 1fr)',
            gap: 3,
          }}
        >
          {TILES.map((t, k) => (
            <span
              key={k}
              style={{
                paddingTop: '100%',
                background: tileColor(t, k),
                borderRadius: 1,
                opacity: alive[k] ? 1 : 0.35,
                transition: 'background .25s ease, opacity .25s ease',
              }}
            />
          ))}
        </div>
      </div>

      {/* verdict */}
      <div
        style={{
          margin: '14px 0 0',
          padding: '12px 16px',
          borderTop: `1px solid ${C.border}`,
          background: dark ? '#0a0f0d' : '#f7f9f8',
          minHeight: 92,
        }}
      >
        {stage < 4 ? (
          <div style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.6 }}>
            Each lookup keeps only the documents that contain that piece. Whatever survives all of
            them gets the real regex run on it, which is the only expensive step.
          </div>
        ) : (
          <div style={{ fontSize: 11.5, lineHeight: 1.65 }}>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ color: C.ink }}>
                <span style={{ color: P.good, fontWeight: 600 }}>{foundTrue}</span> of {nTrue} real
                matches found
              </span>
              <span style={{ color: C.muted }}>
                {nAlive - foundTrue} false positive{nAlive - foundTrue === 1 ? '' : 's'} to discard
              </span>
              <span style={{ color: L.sound ? P.good : P.bad, fontWeight: 600 }}>{L.verdict}</span>
            </div>
            <div style={{ color: C.muted, marginBottom: !L.sound ? 6 : 0 }}>{L.note}</div>
            {!L.sound && (
              <div style={{ color: C.muted }}>
                The two it misses are real documents:
                {MISSES.filter((x) => !x.ok).map((x) => (
                  <span key={x.code}>
                    {' '}
                    <code style={{ fontFamily: MONO, color: C.ink }}>{x.code}</code> tokenises the
                    piece as <code style={{ fontFamily: MONO, color: P.bad }}>{x.piece}</code>,
                  </span>
                ))}{' '}
                and neither is the <code style={{ fontFamily: MONO }}>{'·get'}</code> the query
                produced. Dropping a real match is a wrong answer, not a slow one, which is why this
                route also has to record{' '}
                <strong style={{ color: C.ink }}>which pieces sit next to each other</strong>.
              </div>
            )}
          </div>
        )}
      </div>
    </figure>
  )
}

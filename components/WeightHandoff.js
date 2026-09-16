import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import {
  DERIVE_DOCS,
  DERIVE_WORDS,
  LABEL,
  MONO,
  VOCAB_SIZE,
  cardStyle,
  chipStyle,
  derivePieces,
  labChrome,
  segButton,
} from '../lib/wordpiece-lab'

// Widget 4 of four, and the argument: flip the weights from a formula to a
// model and watch the posting lists sit still. The doc ids and the term
// frequencies are the same objects in all three modes, because the model emits
// weights over the same wordpiece vocabulary the index is keyed by.
//
// The weight column is illustrative, and the widget says so. What is exact here
// is the structure: which rows exist, which documents each row holds, and which
// of the three modes adds a posting (only expansion does).

const FLOOR_C = 0.31

// weight in d1, the document the panel is showing.
const WEIGHTS = {
  token: { bm25: 0.92, model: 1.31 },
  '##ization': { bm25: 1.85, model: 0.0 },
  '##s': { bm25: 0.21, model: 0.0 },
}

const EXPANSION = [
  { piece: 'retrieval', model: 0.74 },
  { piece: 'text', model: 0.52 },
]

const MODES = [
  ['bm25', 'BM25'],
  ['model', 'model'],
  ['floor', 'max(model, 0.31 x bm25)'],
]

export default function WeightHandoff() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const c = labChrome(dark)

  const [mode, setMode] = useState('bm25')
  const [expand, setExpand] = useState(false)

  const acc = derivePieces(DERIVE_WORDS, DERIVE_DOCS)
  const pieces = ['token', '##ization', '##izer', '##s']
  const listFor = (p) => DERIVE_DOCS.filter((d) => acc[p] && acc[p][d]).map((d) => [d, acc[p][d]])
  const basePostings = pieces.reduce((n, p) => n + listFor(p).length, 0)
  const postings = basePostings + (expand ? EXPANSION.length : 0)

  const weightOf = (p) => {
    const w = WEIGHTS[p]
    if (!w) return null
    if (mode === 'bm25') return w.bm25
    if (mode === 'model') return w.model
    return Math.max(w.model, FLOOR_C * w.bm25)
  }

  const th = {
    ...LABEL,
    color: c.muted,
    padding: '6px 8px',
    textAlign: 'left',
    borderBottom: `1px solid ${c.axis}`,
  }
  const td = {
    padding: '7px 8px',
    fontFamily: MONO,
    fontSize: 12.5,
    borderBottom: `1px solid ${c.border}`,
    verticalAlign: 'middle',
  }

  return (
    <div style={cardStyle(c)}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {MODES.map(([key, label], i) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              aria-pressed={mode === key}
              style={{
                ...segButton(c, mode === key),
                marginLeft: i === 0 ? 0 : -1,
                fontSize: 11.5,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12,
            color: c.muted,
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={expand}
            onChange={(e) => setExpand(e.target.checked)}
            style={{ accentColor: c.accent }}
          />
          document-side expansion
        </label>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>term</th>
            <th style={th}>posting list</th>
            <th style={{ ...th, textAlign: 'right' }}>weight in d1</th>
          </tr>
        </thead>
        <tbody>
          {pieces.map((p) => {
            const w = weightOf(p)
            const zeroed = mode === 'model' && w === 0
            return (
              <tr key={p}>
                <td style={{ ...td, color: c.ink }}>{p}</td>
                <td style={td}>
                  <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
                    {listFor(p).map(([d, tf]) => (
                      <span key={d} style={{ ...chipStyle(c), fontSize: 11.5 }}>
                        {d}
                        <span style={{ opacity: 0.7 }}>tf {tf}</span>
                      </span>
                    ))}
                  </span>
                </td>
                <td
                  style={{
                    ...td,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    color: w === null ? c.muted : zeroed ? c.bad : c.ink,
                    fontWeight: zeroed ? 700 : 400,
                  }}
                >
                  {w === null ? '·' : w.toFixed(2)}
                </td>
              </tr>
            )
          })}
          {expand &&
            EXPANSION.map((e) => (
              <tr key={e.piece}>
                <td style={{ ...td, color: c.channel[2] }}>{e.piece}</td>
                <td style={td}>
                  <span style={{ ...chipStyle(c, { tint: c.channel[2] }), fontSize: 11.5 }}>
                    d1
                    <span style={{ opacity: 0.8 }}>new posting</span>
                  </span>
                </td>
                <td
                  style={{
                    ...td,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    color: mode === 'bm25' ? c.muted : c.channel[2],
                  }}
                >
                  {mode === 'bm25' ? '·' : e.model.toFixed(2)}
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      {/* the invariants, which are the point */}
      <div
        style={{
          marginTop: 10,
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          background: c.lane,
          border: `1px solid ${c.border}`,
          borderRadius: 2,
          padding: '9px 11px',
        }}
      >
        {[
          ['vocabulary', `${VOCAB_SIZE.toLocaleString()} pieces`],
          ['postings', `${postings}`],
          ['lists rebuilt', '0'],
        ].map(([k, v]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ ...LABEL, color: c.muted }}>{k}</span>
            <span style={{ fontFamily: MONO, fontSize: 13, color: c.ink }}>{v}</span>
          </span>
        ))}
        <span style={{ fontSize: 12, color: c.muted, lineHeight: 1.45, flex: '1 1 220px' }}>
          {expand
            ? `Expansion is the one step that adds postings: ${basePostings} to ${postings} here, on terms d1 never contained.`
            : 'Switching the weights leaves every doc id and every tf exactly where it was.'}
        </span>
      </div>

      <div style={{ marginTop: 9, fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
        {mode === 'model'
          ? 'The model can zero a term the document contains, which is how ##ization goes to 0.00 here.'
          : mode === 'floor'
          ? 'The floor puts a zeroed term back at 0.31 times its BM25 weight, and leaves every weight the model scored higher alone.'
          : 'BM25 weights every term the document holds, and can never zero one of them.'}{' '}
        Weights in this panel are illustrative. The measured numbers are in the tables around it.
      </div>
    </div>
  )
}

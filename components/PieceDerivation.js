import { useTheme } from 'next-themes'
import { useMemo, useState, useEffect } from 'react'
import {
  DERIVE_DOCS,
  DERIVE_WORDS,
  LABEL,
  MONO,
  cardStyle,
  chipStyle,
  derivePieces,
  labChrome,
  segButton,
} from '../lib/wordpiece-lab'

// Widget 3 of four: the identity that lets one index stand in for two.
//
//   forward   tf_p(d) = sum over words v containing p of count_p(v) * tf_v(d)
//             stepped one word at a time, left table to right table.
//   reverse   a word is a run of pieces, which is exact only with positions and
//             the trailing ## check, and only a bound without positions.
//
// Stepping is manual on purpose: the arithmetic is the content, so a loop that
// plays on its own would be the wrong shape.

const PIECE_ORDER = ['token', '##ization', '##izer', '##s']

// The reverse example, one document: `token tokenization`, which tokenizes to
// three pieces and contains the word `token` exactly once.
const REV = {
  doc: 'token tokenization',
  seq: ['token', 'token', '##ization'],
  words: [
    { word: 'token', pieces: ['token'], naive: 2, checked: 1, bound: 2 },
    { word: 'tokenization', pieces: ['token', '##ization'], naive: 1, checked: 1, bound: 1 },
  ],
}

export default function PieceDerivation() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const c = labChrome(dark)

  const [tab, setTab] = useState('forward')
  const [step, setStep] = useState(0)
  const [checkOn, setCheckOn] = useState(true)

  const done = step >= DERIVE_WORDS.length
  const applied = useMemo(() => DERIVE_WORDS.slice(0, step), [step])
  const acc = useMemo(() => derivePieces(applied, DERIVE_DOCS), [applied])
  const active = done ? null : DERIVE_WORDS[step]

  const cell = (v, hot) => ({
    padding: '5px 8px',
    textAlign: 'right',
    fontFamily: MONO,
    fontSize: 12.5,
    fontVariantNumeric: 'tabular-nums',
    color: hot ? c.channel[0] : v ? c.ink : c.muted,
    fontWeight: hot ? 700 : 400,
    borderBottom: `1px solid ${c.border}`,
    background: hot ? c.lane : 'transparent',
  })
  const head = {
    ...LABEL,
    color: c.muted,
    padding: '5px 8px',
    textAlign: 'right',
    borderBottom: `1px solid ${c.axis}`,
  }
  const rowLabel = (hot) => ({
    padding: '5px 8px',
    fontFamily: MONO,
    fontSize: 12.5,
    textAlign: 'left',
    color: hot ? c.channel[0] : c.ink,
    fontWeight: hot ? 700 : 400,
    borderBottom: `1px solid ${c.border}`,
    whiteSpace: 'nowrap',
  })

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
        <div style={{ display: 'flex' }}>
          {[
            ['forward', 'words → pieces'],
            ['reverse', 'pieces → words'],
          ].map(([key, label], i) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              aria-pressed={tab === key}
              style={{ ...segButton(c, tab === key), marginLeft: i === 0 ? 0 : -1 }}
            >
              {label}
            </button>
          ))}
        </div>
        <span style={{ ...LABEL, color: c.muted }}>
          {tab === 'forward'
            ? 'exact, no positions needed'
            : 'exact with positions, a bound without'}
        </span>
      </div>

      {tab === 'forward' ? (
        <>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12.5,
              color: c.muted,
              background: c.lane,
              border: `1px solid ${c.border}`,
              borderRadius: 2,
              padding: '8px 11px',
              marginBottom: 10,
              overflowX: 'auto',
            }}
          >
            tf_p(d) = sum over words v containing p of count_p(v) * tf_v(d)
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 10,
            }}
          >
            {/* left: what you store */}
            <div
              style={{
                border: `1px solid ${c.border}`,
                borderRadius: 2,
                padding: '9px 10px',
                background: c.lane,
              }}
            >
              <span style={{ ...LABEL, color: c.muted }}>word postings, stored</span>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                <thead>
                  <tr>
                    <th style={{ ...head, textAlign: 'left' }}>word</th>
                    {DERIVE_DOCS.map((d) => (
                      <th key={d} style={head}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DERIVE_WORDS.map((w, i) => {
                    const hot = !done && i === step
                    return (
                      <tr key={w.word} style={{ opacity: i < step || hot ? 1 : 0.5 }}>
                        <td style={rowLabel(hot)}>{w.word}</td>
                        {DERIVE_DOCS.map((d) => (
                          <td key={d} style={cell(w.postings[d], hot && w.postings[d])}>
                            {w.postings[d] || '·'}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* right: what you derive */}
            <div
              style={{
                border: `1px solid ${c.axis}`,
                borderRadius: 2,
                padding: '9px 10px',
                background: c.lane,
              }}
            >
              <span style={{ ...LABEL, color: c.channel[0] }}>piece postings, derived</span>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 6 }}>
                <thead>
                  <tr>
                    <th style={{ ...head, textAlign: 'left' }}>piece</th>
                    {DERIVE_DOCS.map((d) => (
                      <th key={d} style={head}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PIECE_ORDER.map((p) => {
                    const hot = active ? active.pieces.includes(p) : false
                    return (
                      <tr key={p}>
                        <td style={rowLabel(hot)}>{p}</td>
                        {DERIVE_DOCS.map((d) => {
                          const v = acc[p] ? acc[p][d] : 0
                          return (
                            <td key={d} style={cell(v, hot && active.postings[d])}>
                              {v || '·'}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* what this step does */}
          <div
            style={{
              marginTop: 10,
              minHeight: 44,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
              fontSize: 12.5,
              color: c.muted,
              lineHeight: 1.5,
            }}
          >
            {active ? (
              <>
                <span style={chipStyle(c)}>{active.word}</span>
                <span style={{ color: c.axis }}>→</span>
                {active.pieces.map((p, j) => (
                  <span key={`${p}-${j}`} style={chipStyle(c, { tint: c.channel[0] })}>
                    {p}
                  </span>
                ))}
                <span>
                  adds{' '}
                  {DERIVE_DOCS.filter((d) => active.postings[d])
                    .map((d) => `${d}: ${active.postings[d]}`)
                    .join(', ')}{' '}
                  to each of those piece lists.
                  {active.pieces.length !== new Set(active.pieces).size
                    ? ' A piece that repeats inside the word counts twice.'
                    : ''}
                </span>
              </>
            ) : (
              <span>
                Every piece list is now exactly what a directly built piece index holds. In the real
                corpora all 217,815 of them rebuilt this way, on every collection.
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              style={{ ...segButton(c, false), opacity: step === 0 ? 0.45 : 1 }}
            >
              back
            </button>
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(DERIVE_WORDS.length, s + 1))}
              disabled={done}
              style={{ ...segButton(c, !done), opacity: done ? 0.45 : 1 }}
            >
              next word
            </button>
            <button type="button" onClick={() => setStep(0)} style={segButton(c, false)}>
              reset
            </button>
            <span style={{ ...LABEL, color: c.muted, marginLeft: 'auto' }}>
              step {Math.min(step + (done ? 0 : 1), DERIVE_WORDS.length)} of {DERIVE_WORDS.length}
            </span>
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...LABEL, color: c.muted }}>one document</span>
            <span style={{ fontSize: 13, fontFamily: MONO, color: c.ink }}>{REV.doc}</span>
          </div>

          <div
            style={{
              marginTop: 8,
              background: c.lane,
              border: `1px solid ${c.border}`,
              borderRadius: 2,
              padding: '10px 12px',
            }}
          >
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {REV.seq.map((p, i) => (
                <span
                  key={`${p}-${i}`}
                  style={{
                    ...chipStyle(c, { tint: c.channel[0] }),
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 2,
                  }}
                >
                  <span style={{ fontSize: 10, opacity: 0.7 }}>pos {i}</span>
                  {p}
                </span>
              ))}
              <label
                style={{
                  marginLeft: 'auto',
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
                  checked={checkOn}
                  onChange={(e) => setCheckOn(e.target.checked)}
                  style={{ accentColor: c.accent }}
                />
                trailing ## check
              </label>
            </div>

            <div
              style={{
                marginTop: 10,
                display: 'flex',
                gap: 8,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              <span style={{ ...LABEL, color: c.muted }}>the word `token` matches at</span>
              <span style={chipStyle(c, { tint: c.channel[1] })}>pos 0 ✓</span>
              <span
                style={chipStyle(c, {
                  tint: checkOn ? c.bad : c.channel[1],
                  strike: checkOn,
                })}
              >
                pos 1 {checkOn ? '✗' : '✓'}
              </span>
              <span style={{ fontSize: 12, color: c.muted, lineHeight: 1.45 }}>
                {checkOn
                  ? 'rejected, because the next piece carries ##, so position 1 is the front of a longer word'
                  : 'accepted, because naive adjacency cannot see that a continuation piece follows'}
              </span>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10 }}>
            <thead>
              <tr>
                <th style={{ ...head, textAlign: 'left' }}>word</th>
                <th style={head}>derived tf</th>
                <th style={head}>true tf</th>
                <th style={head}>position-free bound</th>
              </tr>
            </thead>
            <tbody>
              {REV.words.map((w) => {
                const derived = checkOn ? w.checked : w.naive
                const wrong = derived !== w.checked
                return (
                  <tr key={w.word}>
                    <td style={rowLabel(false)}>{w.word}</td>
                    <td
                      style={{
                        ...cell(derived, false),
                        color: wrong ? c.bad : c.ink,
                        fontWeight: wrong ? 700 : 400,
                      }}
                    >
                      {derived}
                      {wrong ? ' ✗' : ''}
                    </td>
                    <td style={cell(w.checked, false)}>{w.checked}</td>
                    <td style={cell(w.bound, false)}>
                      {w.bound}
                      {w.bound !== w.checked ? (
                        <span style={{ fontSize: 10.5, color: c.muted }}> overshoots</span>
                      ) : (
                        <span style={{ fontSize: 10.5, color: c.muted }}> tight</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 10, fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>
            {checkOn
              ? 'With the check, the word `token` occurs once, which is the truth: the run at position 1 is the front of `tokenization`. The position-free bound still reads 2 for it, because counting pieces cannot tell those two apart. For `tokenization` the bound is tight.'
              : 'Without the check, `token` picks up the occurrence at position 1, which belongs to `tokenization`. That is the same mistake that gave `un` 1,565 documents it never appears in on Touche2020.'}
          </div>
        </>
      )}
    </div>
  )
}

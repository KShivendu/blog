import { useTheme } from 'next-themes'
import { useEffect, useMemo, useState } from 'react'
import {
  ABSENT_PIECES,
  KNOWN_SPLITS,
  LABEL,
  MONO,
  SPLIT_PRESETS,
  VOCAB_SIZE,
  cardStyle,
  chipStyle,
  labChrome,
  loadVocab,
  segButton,
  splitPhrase,
} from '../lib/wordpiece-lab'

// Widget 1 of four for wordpiece-token-search.mdx: the premise. Type a word,
// watch WordPiece cut it up, and read the postings that go on disk underneath.
// The tokenizer is real: the bert-base-uncased vocabulary is fetched once and
// run through greedy longest-match. If that fetch fails the widget falls back
// to the verified splits in lib/wordpiece-lab.js and says so, so the preset row
// keeps working and the post still reads correctly.
//
// Visual language follows TokenSearchAnalyzer and StemExpandHero, with the
// palette composed from chartChrome + vizPalette instead of a private copy.

export default function WordpieceSplit() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const c = labChrome(dark)

  const [text, setText] = useState(SPLIT_PRESETS[0])
  const [vocab, setVocab] = useState(null)
  const [vocabState, setVocabState] = useState('loading')

  useEffect(() => {
    let live = true
    loadVocab().then((v) => {
      if (!live) return
      setVocab(v)
      setVocabState(v ? 'ready' : 'fallback')
    })
    return () => {
      live = false
    }
  }, [])

  const split = useMemo(() => splitPhrase(text, vocab), [text, vocab])
  const known = split.every((s) => s.pieces)

  // One posting per piece the text actually contains, with its count.
  const postings = useMemo(() => {
    const acc = new Map()
    for (const s of split) {
      if (!s.pieces) continue
      for (const p of s.pieces) acc.set(p, (acc.get(p) || 0) + 1)
    }
    return [...acc.entries()]
  }, [split])

  const wordCount = split.length
  const pieceCount = split.reduce((n, s) => n + (s.pieces ? s.pieces.length : 0), 0)

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
        <span style={{ ...LABEL, color: c.muted }}>WordPiece · bert-base-uncased</span>
        <span style={{ ...LABEL, letterSpacing: '0.03em', color: c.muted }}>
          {vocabState === 'ready'
            ? `${VOCAB_SIZE.toLocaleString()} pieces in the vocabulary`
            : vocabState === 'loading'
            ? 'loading the vocabulary'
            : 'offline, showing the built-in splits'}
        </span>
      </div>

      <label style={{ display: 'block' }}>
        <span style={{ ...LABEL, color: c.muted }}>text to index</span>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          aria-label="text to split into wordpieces"
          style={{
            display: 'block',
            width: '100%',
            marginTop: 6,
            padding: '9px 11px',
            background: c.lane,
            border: `1px solid ${c.axis}`,
            borderRadius: 2,
            color: c.ink,
            fontFamily: MONO,
            fontSize: 14,
            outline: 'none',
          }}
        />
      </label>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0 14px' }}>
        {SPLIT_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setText(p)}
            style={{ ...segButton(c, p === text), fontSize: 11.5 }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* the split itself */}
      <div
        style={{
          background: c.lane,
          border: `1px solid ${c.border}`,
          borderRadius: 2,
          padding: '10px 12px',
        }}
      >
        <span style={{ ...LABEL, color: c.muted }}>the split</span>
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {split.length === 0 && (
            <span style={{ fontSize: 12.5, color: c.muted }}>Type a word to see it split.</span>
          )}
          {split.map((s, i) => (
            <div
              key={`${s.word}-${i}`}
              style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
            >
              <span style={chipStyle(c)}>{s.word}</span>
              <span style={{ color: c.axis, fontSize: 13 }}>→</span>
              {s.pieces ? (
                s.pieces.map((p, j) => (
                  <span key={`${p}-${j}`} style={chipStyle(c, { tint: c.channel[0] })}>
                    {p}
                  </span>
                ))
              ) : (
                <span style={{ ...chipStyle(c, { on: false }), textDecoration: 'none' }}>
                  vocabulary not loaded
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* what gets stored */}
      <div
        style={{
          marginTop: 8,
          background: c.lane,
          border: `1px solid ${c.border}`,
          borderRadius: 2,
          padding: '10px 12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 8,
          }}
        >
          <span style={{ ...LABEL, color: c.muted }}>postings written for this document</span>
          <span style={{ ...LABEL, letterSpacing: '0.03em', color: c.channel[0] }}>
            {postings.length} of {VOCAB_SIZE.toLocaleString()}
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {postings.map(([p, tf]) => (
            <span key={p} style={chipStyle(c, { tint: c.channel[0] })}>
              {p}
              <span style={{ fontSize: 10.5, opacity: 0.75, fontVariantNumeric: 'tabular-nums' }}>
                d1:{tf}
              </span>
            </span>
          ))}
        </div>
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {ABSENT_PIECES.filter((p) => !postings.some(([q]) => q === p)).map((p) => (
            <span key={p} style={chipStyle(c, { on: false })}>
              {p}
              <span style={{ fontSize: 10.5 }}>no posting</span>
            </span>
          ))}
          <span style={{ fontSize: 12, color: c.muted, alignSelf: 'center', lineHeight: 1.45 }}>
            and so on for the rest of the vocabulary, which this document never writes to.
          </span>
        </div>
      </div>

      <div style={{ marginTop: 10, fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>
        {wordCount} word{wordCount === 1 ? '' : 's'}, {pieceCount} piece
        {pieceCount === 1 ? '' : 's'}, {postings.length} posting
        {postings.length === 1 ? '' : 's'}.{' '}
        {known
          ? 'The vocabulary is fixed, so this split is the same one the model computes two years from now.'
          : 'Some words fall back to the built-in table until the vocabulary loads.'}
      </div>
    </div>
  )
}

// Exported for the fallback path in tests and for other widgets that want the
// same splits without a network round trip.
export { KNOWN_SPLITS }

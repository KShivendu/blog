import { useTheme } from 'next-themes'
import { useEffect, useMemo, useState } from 'react'
import {
  DOCS,
  KNOWN_SPLITS,
  LABEL,
  MONO,
  QUERIES,
  STEMS,
  cardStyle,
  chipStyle,
  labChrome,
  loadVocab,
  segButton,
  wordpiece,
} from '../lib/wordpiece-lab'

// Widget 2 of four: which channel fires on which document. The point to feel is
// that the document holding the literal query word lights the exact channel AND
// the family channel, while a document holding only another member of the
// family lights the family channel alone. That is what makes the three channels
// anchoring rather than conflation: the exact form keeps its own evidence.
//
// Splits come from the real vocabulary when it loads and from the verified
// table in lib/wordpiece-lab.js otherwise. Stems are snowballstemmer English,
// the stemmer the benchmark runs use.

const CHANNEL_NAMES = ['piece', 'exact word', 'stem family']

export default function ThreeChannels() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const c = labChrome(dark)

  const [q, setQ] = useState(QUERIES[0])
  const [vocab, setVocab] = useState(null)
  useEffect(() => {
    let live = true
    loadVocab().then((v) => live && setVocab(v))
    return () => {
      live = false
    }
  }, [])

  const piecesOf = useMemo(
    () => (w) => wordpiece(w, vocab) || KNOWN_SPLITS[w] || [w],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vocab]
  )

  const qPieces = piecesOf(q)
  const qStem = STEMS[q] || q

  const rows = DOCS.map((d) => {
    const words = Object.keys(d.words)
    const exact = words.includes(q)
    const familyWords = words.filter((w) => (STEMS[w] || w) === qStem)
    const shared = [...new Set(words.flatMap(piecesOf))].filter((p) => qPieces.includes(p))
    return {
      doc: d,
      words,
      exact,
      familyWords,
      shared,
      fired: [shared.length > 0, exact, familyWords.length > 0],
    }
  })

  const wordTint = (w) => {
    if (w === q) return c.channel[1]
    if ((STEMS[w] || w) === qStem) return c.channel[2]
    if (piecesOf(w).some((p) => qPieces.includes(p))) return c.channel[0]
    return null
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
        <div style={{ display: 'flex' }}>
          {QUERIES.map((qq, i) => (
            <button
              key={qq}
              type="button"
              onClick={() => setQ(qq)}
              aria-pressed={qq === q}
              style={{ ...segButton(c, qq === q), marginLeft: i === 0 ? 0 : -1 }}
            >
              {qq}
            </button>
          ))}
        </div>
        <span style={{ ...LABEL, color: c.muted }}>one query, three channels</span>
      </div>

      {/* the query, broken into what each channel actually looks for */}
      <div
        style={{
          background: c.lane,
          border: `1px solid ${c.border}`,
          borderRadius: 2,
          padding: '10px 12px',
          marginBottom: 10,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 14,
        }}
      >
        {[
          { name: CHANNEL_NAMES[0], items: qPieces },
          { name: CHANNEL_NAMES[1], items: [q] },
          { name: CHANNEL_NAMES[2], items: [`stem ${qStem}`] },
        ].map((ch, i) => (
          <div key={ch.name} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ ...LABEL, color: c.channel[i] }}>{ch.name}</span>
            {ch.items.map((it) => (
              <span key={it} style={chipStyle(c, { tint: c.channel[i] })}>
                {it}
              </span>
            ))}
          </div>
        ))}
      </div>

      {/* one row per document */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows.map((r) => {
          const any = r.fired.some(Boolean)
          return (
            <div
              key={r.doc.id}
              style={{
                border: `1px solid ${any ? c.axis : c.border}`,
                background: any ? c.lane : 'transparent',
                borderRadius: 2,
                padding: '9px 11px',
                opacity: any ? 1 : 0.72,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginBottom: 8,
                }}
              >
                <span style={{ ...LABEL, color: c.muted }}>{r.doc.id}</span>
                {r.doc.text.split(' ').map((w, i) => {
                  const clean = w.replace(/[^a-z0-9]/g, '')
                  const tint = wordTint(clean)
                  return (
                    <span
                      key={`${w}-${i}`}
                      style={{
                        fontSize: 13,
                        fontFamily: MONO,
                        color: tint || c.muted,
                        fontWeight: tint ? 600 : 400,
                        borderBottom: tint ? `2px solid ${tint}` : '2px solid transparent',
                      }}
                    >
                      {w}
                    </span>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CHANNEL_NAMES.map((name, i) => (
                  <span
                    key={name}
                    style={{
                      ...chipStyle(c, { on: r.fired[i], tint: r.fired[i] ? c.channel[i] : null }),
                      fontSize: 11.5,
                    }}
                  >
                    {r.fired[i] ? '●' : '○'} {name}
                  </span>
                ))}
                <span
                  style={{
                    fontSize: 12,
                    color: c.muted,
                    alignSelf: 'center',
                    lineHeight: 1.45,
                  }}
                >
                  {r.exact
                    ? `holds ${q} itself, so the exact channel and the family channel both score it`
                    : r.familyWords.length > 0
                    ? `holds ${r.familyWords.join(
                        ', '
                      )}, family only, the exact channel scores it nothing`
                    : r.shared.length > 0
                    ? `shares the piece ${r.shared.join(', ')} and nothing else`
                    : 'no channel reaches it'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 12.5, color: c.muted, lineHeight: 1.5 }}>
        All three channels read the same stored posting lists. A stemmed index folds every member of
        the family onto one term, so afterwards it can no longer tell which document used the
        query&rsquo;s own form.
      </div>
    </div>
  )
}

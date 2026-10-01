import { LABEL, cardStyle, hexFade } from '../lib/wordpiece-lab'
import { useChrome } from '../lib/cheap-rewriter'

/*
 * The LLM's real passage for one query, every word coloured by where it also
 * appears: the query itself, one of BM25's top 10 docs, or nowhere. Matching is
 * by stem, the words shown are the passage's own. Data: `pick.passage` in cheap-rewriter.json
 * (research/query-rewriter/qrw/export_blog.py).
 */

export default function PassageColors({ data: x }) {
  const c = useChrome()
  const tone = {
    docs: { background: hexFade(c.picker, 0.22), color: c.ink, borderRadius: 3, padding: '0 2px' },
    llm: { color: c.llm, textDecoration: 'underline dotted', textUnderlineOffset: 3 },
    query: { color: c.ink, fontWeight: 700 },
    stop: { color: c.muted },
    sep: { color: c.muted },
  }
  const key = (style, text) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 14 }}>
      <span style={{ ...style, fontSize: 12.5 }}>{text}</span>
    </span>
  )
  return (
    <div style={cardStyle(c)}>
      <div style={{ fontSize: 13.5, marginBottom: 10 }}>
        <span style={{ ...LABEL, color: c.muted, marginRight: 8 }}>query</span>
        {x.q}
      </div>
      <div style={{ ...LABEL, color: c.llm, marginBottom: 6 }}>what the LLM wrote</div>
      <p style={{ fontSize: 15, lineHeight: 1.9, margin: '0 0 10px' }}>
        {x.passage.map(([t, cls], i) => (
          // one- or two-letter fragments like the "s" of "material's" read as noise
          <span key={i} style={tone[cls === 'docs' && /^[a-z]{1,2}$/i.test(t) ? 'stop' : cls]}>
            {t}
          </span>
        ))}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', rowGap: 4 }}>
        {key(tone.docs, 'also in BM25’s top 10 docs')}
        {key(tone.llm, 'in no top-10 doc')}
        {key(tone.query, 'in the query')}
      </div>
    </div>
  )
}

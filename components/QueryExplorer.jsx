import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { chartChrome, vizPalette } from '../lib/viz-palette'

/**
 * Three queries from the run, opened up. The post argues the summaries tell you
 * where to look and the queries tell you why, so this is the why: click one and
 * you get the terms each analyzer sent to the index, and the documents it got
 * back, with the judged-relevant one marked.
 *
 * Three rather than all 599, and each document trimmed to a line. The point is
 * that a person can read one failure in a few seconds.
 *
 * All 5 documents stay: the corn flakes query has its relevant doc at rank 4
 * before the stemmer, so cutting to 3 would claim a rank the reader can't see.
 *
 * Data comes from scripts/gen_query_docs.py.
 */
const DATA_URL = '/static/data/relevance-tail-docs.json'
const DOCS_SHOWN = 5
const SNIPPET = 150

const MONO = 'var(--font-mono, ui-monospace, monospace)'
const S = {
  head: {
    width: '100%',
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: '8px',
    padding: '9px 10px',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    font: `13px ${MONO}`,
  },
  small: { font: `11px ${MONO}` },
  body: { fontSize: '12px', lineHeight: 1.45 },
  term: { padding: '0 3px', borderRadius: '2px', background: 'transparent' },
}

export default function QueryExplorer() {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(0)

  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const C = chartChrome(mounted && resolvedTheme === 'dark')
  const P = vizPalette(mounted && resolvedTheme === 'dark')

  useEffect(() => {
    let alive = true
    fetch(DATA_URL)
      .then((r) => r.json())
      .then((d) => alive && setData(d.queries))
      .catch(() => alive && setData([]))
    return () => {
      alive = false
    }
  }, [])

  if (!data) return <div style={{ ...S.body, color: C.muted }}>Loading…</div>

  const run = (label, r) => {
    const rank = r.docs.findIndex((d) => d.relevant) + 1
    return (
      <div style={{ marginTop: '10px' }}>
        <div style={{ ...S.small, color: C.muted, marginBottom: '5px' }}>
          <span style={{ color: C.ink }}>{label}</span> sends{' '}
          {r.terms.map((t, i) => (
            <code key={i} style={{ ...S.term, color: C.ink, border: `1px solid ${C.border}` }}>
              {t}
            </code>
          ))}
          <span style={{ color: rank ? P.good : P.bad }}>
            {rank
              ? ` · relevant doc at rank ${rank}`
              : ` · relevant doc not in the top ${DOCS_SHOWN}`}
          </span>
        </div>
        {r.docs.slice(0, DOCS_SHOWN).map((d, i) => (
          <div
            key={i}
            style={{ ...S.body, color: d.relevant ? C.ink : C.muted, marginBottom: '3px' }}
          >
            {d.relevant && <strong style={{ color: P.good }}>[relevant] </strong>}
            {d.text.slice(0, SNIPPET)}
            {d.text.length > SNIPPET && '…'}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="query-explorer" style={{ margin: '1.5rem 0' }}>
      {data.map((q, i) => (
        <div
          key={i}
          style={{ border: `1px solid ${C.border}`, background: C.card, marginBottom: '6px' }}
        >
          <button onClick={() => setOpen(open === i ? -1 : i)} style={{ ...S.head, color: C.ink }}>
            <span style={{ color: C.muted }}>{open === i ? '▾' : '▸'}</span>
            <span style={{ flex: '1 1 240px', minWidth: 0 }}>{q.q}</span>
            <span style={{ color: C.muted, whiteSpace: 'nowrap' }}>
              {q.ndcg10}{' '}
              <span style={{ color: q.ndcg10_en < q.ndcg10 ? P.bad : P.good }}>
                → {q.ndcg10_en}
              </span>
            </span>
          </button>

          {open === i && (
            <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${C.grid}` }}>
              <div style={{ ...S.body, color: C.muted, marginTop: '8px' }}>{q.note}</div>
              {run('word', q.runs.word)}
              {run('word_en', q.runs.word_en)}
            </div>
          )}
        </div>
      ))}
      <div style={{ ...S.small, color: C.muted, marginTop: '6px' }}>
        NDCG@10 before and after · top {DOCS_SHOWN} documents BM25 returned for each
      </div>
    </div>
  )
}

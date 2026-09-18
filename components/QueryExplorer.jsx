import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { chartChrome, vizPalette } from '../lib/viz-palette'

/**
 * Three queries from the run, opened up. The post argues that the summaries only
 * tell you where to look and the queries tell you why, so this is the why: click
 * one and you get the terms each analyzer actually sent to the index, and the top
 * documents it got back, with the judged-relevant one marked.
 *
 * Three rather than all 599 on purpose. The point is that a person can read a
 * failure and understand it in a few seconds, which needs queries about corn
 * flakes and song titles, not the 289-term ArguAna ones.
 *
 * Data comes from scripts/gen_query_docs.py.
 */
const DATA_URL = '/static/data/relevance-tail-docs.json'

export default function QueryExplorer() {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(0)

  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const C = chartChrome(dark)
  const P = vizPalette(dark)

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

  if (!data) {
    return <div style={{ color: C.muted, fontSize: '13px', padding: '16px 0' }}>Loading…</div>
  }

  const mono = 'var(--font-mono, ui-monospace, monospace)'

  const rankOfRelevant = (docs) => {
    const i = docs.findIndex((d) => d.relevant)
    return i < 0 ? null : i + 1
  }

  const runBlock = (label, run, key) => {
    const rank = rankOfRelevant(run.docs)
    return (
      <div key={key} style={{ marginTop: '10px' }}>
        <div style={{ fontSize: '11px', color: C.muted, fontFamily: mono, marginBottom: '4px' }}>
          <span style={{ color: C.ink }}>{label}</span> sends{' '}
          {run.terms.map((t, i) => (
            <span key={i}>
              <code
                style={{
                  background: 'transparent',
                  color: C.ink,
                  border: `1px solid ${C.border}`,
                  borderRadius: '2px',
                  padding: '0 3px',
                }}
              >
                {t}
              </code>{' '}
            </span>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: rank ? P.good : P.bad, fontFamily: mono }}>
          {rank ? `relevant doc comes back at rank ${rank}` : 'relevant doc is not in the top 5'}
        </div>
        <ol style={{ margin: '5px 0 0', paddingLeft: '20px' }}>
          {run.docs.map((d, i) => (
            <li
              key={i}
              style={{
                fontSize: '12px',
                lineHeight: 1.45,
                color: d.relevant ? C.ink : C.muted,
                marginBottom: '3px',
              }}
            >
              {d.relevant && (
                <strong style={{ color: P.good, fontFamily: mono }}>[relevant] </strong>
              )}
              {d.text}
            </li>
          ))}
        </ol>
      </div>
    )
  }

  return (
    <div className="query-explorer" style={{ margin: '1.5rem 0' }}>
      {data.map((q, i) => {
        const worse = q.ndcg10_en < q.ndcg10
        const isOpen = open === i
        return (
          <div
            key={i}
            style={{ border: `1px solid ${C.border}`, background: C.card, marginBottom: '6px' }}
          >
            <button
              onClick={() => setOpen(isOpen ? -1 : i)}
              style={{
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
                fontFamily: mono,
                fontSize: '13px',
                color: C.ink,
              }}
            >
              <span style={{ color: C.muted }}>{isOpen ? '▾' : '▸'}</span>
              <span style={{ flex: '1 1 240px', minWidth: 0 }}>{q.q}</span>
              <span style={{ fontSize: '12px', color: C.muted, whiteSpace: 'nowrap' }}>
                {q.ndcg10} <span style={{ color: worse ? P.bad : P.good }}>→ {q.ndcg10_en}</span>
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: '0 10px 10px', borderTop: `1px solid ${C.grid}` }}>
                <div
                  style={{
                    fontSize: '12px',
                    color: C.muted,
                    margin: '8px 0 0',
                    lineHeight: 1.45,
                  }}
                >
                  {q.note}
                </div>
                {runBlock('word', q.runs.word, 'w')}
                {runBlock('word_en', q.runs.word_en, 'e')}
              </div>
            )}
          </div>
        )
      })}
      <div style={{ fontSize: '11px', color: C.muted, fontFamily: mono, marginTop: '6px' }}>
        NDCG@10 before and after · top 5 documents BM25 returned for each
      </div>
    </div>
  )
}

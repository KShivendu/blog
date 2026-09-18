import { useEffect, useMemo, useState } from 'react'
import { useTheme } from 'next-themes'
import { chartChrome, vizPalette } from '../lib/viz-palette'

/**
 * The thing the relevance-tail post tells you to build: a table of per-query
 * before/after scores you can filter, sort and search. Reading these rows is the
 * point, and every summary in that post is a way of deciding which rows to open.
 *
 * Deliberately plain. No virtualisation, no column config, no chart. 599 rows is
 * a small enough golden set that a filter box and a sort toggle cover it, which
 * is the post's argument about golden sets being test-suite sized.
 */
const DATA_URL = '/static/data/relevance-tail.json'

const METRICS = [
  { key: 'ndcg10', label: 'NDCG@10' },
  { key: 'r10', label: 'recall@10' },
  { key: 'r100', label: 'recall@100' },
]

// scores live 0..1 in the data and are shown x100 everywhere a human reads them
const s100 = (v) => (v * 100).toFixed(1)
const sDelta = (v) => (v >= 0 ? `+${(v * 100).toFixed(1)}` : (v * 100).toFixed(1))

const EPS = 1e-9
const BUCKETS = [
  { key: 'degraded', label: 'degraded', test: (d) => d < -EPS },
  { key: 'improved', label: 'improved', test: (d) => d > EPS },
  { key: 'unchanged', label: 'unchanged', test: (d) => Math.abs(d) <= EPS },
  { key: 'all', label: 'all', test: () => true },
]

export default function QueryExplorer({ rowsShown = 12 }) {
  const [data, setData] = useState(null)
  const [metric, setMetric] = useState('ndcg10')
  const [bucket, setBucket] = useState('degraded')
  const [search, setSearch] = useState('')
  const [worstFirst, setWorstFirst] = useState(true)
  const [limit, setLimit] = useState(rowsShown)

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
      .then((d) => alive && setData(d.rows))
      .catch(() => alive && setData([]))
    return () => {
      alive = false
    }
  }, [])

  const all = useMemo(() => {
    if (!data) return []
    return data.map((r) => ({
      ds: r.ds,
      q: r.q,
      before: r[metric],
      after: r[`${metric}_en`],
      d: r[`${metric}_en`] - r[metric],
    }))
  }, [data, metric])

  const counts = useMemo(() => {
    const c = {}
    for (const b of BUCKETS) c[b.key] = all.filter((r) => b.test(r.d)).length
    return c
  }, [all])

  const rows = useMemo(() => {
    const b = BUCKETS.find((x) => x.key === bucket)
    const needle = search.trim().toLowerCase()
    const out = all.filter(
      (r) =>
        b.test(r.d) &&
        (!needle || r.q.toLowerCase().includes(needle) || r.ds.toLowerCase().includes(needle))
    )
    // ties have no delta to rank by, so they sort by score instead
    out.sort((x, y) =>
      bucket === 'unchanged'
        ? worstFirst
          ? x.before - y.before
          : y.before - x.before
        : worstFirst
        ? x.d - y.d
        : y.d - x.d
    )
    return out
  }, [all, bucket, search, worstFirst])

  useEffect(() => setLimit(rowsShown), [bucket, metric, search, rowsShown])

  const seg = (active) => ({
    padding: '3px 9px',
    fontSize: '12px',
    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
    border: `1px solid ${active ? C.accent : C.border}`,
    background: active ? C.accent : 'transparent',
    color: active ? C.accentInk : C.muted,
    borderRadius: '3px',
    cursor: 'pointer',
    lineHeight: 1.6,
  })

  if (!data) {
    return (
      <div style={{ color: C.muted, fontSize: '13px', padding: '18px 0' }}>Loading queries…</div>
    )
  }

  return (
    <div
      className="query-explorer"
      style={{
        margin: '1.5rem 0',
        border: `1px solid ${C.border}`,
        background: C.card,
        padding: '10px',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
        {METRICS.map((m) => (
          <button key={m.key} onClick={() => setMetric(m.key)} style={seg(metric === m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
        {BUCKETS.map((b) => (
          <button key={b.key} onClick={() => setBucket(b.key)} style={seg(bucket === b.key)}>
            {b.label} {counts[b.key]}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="search the queries…"
          style={{
            flex: '1 1 200px',
            minWidth: 0,
            padding: '4px 8px',
            fontSize: '12px',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            border: `1px solid ${C.border}`,
            background: 'transparent',
            color: C.ink,
            borderRadius: '3px',
          }}
        />
        <button onClick={() => setWorstFirst((v) => !v)} style={seg(false)}>
          {worstFirst ? '↓ worst first' : '↑ best first'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '12px',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
          }}
        >
          <thead>
            <tr style={{ color: C.muted, textAlign: 'left' }}>
              <th style={{ padding: '4px 6px', fontWeight: 400 }}>query</th>
              <th style={{ padding: '4px 6px', fontWeight: 400, textAlign: 'right' }}>word</th>
              <th style={{ padding: '4px 6px', fontWeight: 400, textAlign: 'right' }}>word_en</th>
              <th style={{ padding: '4px 6px', fontWeight: 400, textAlign: 'right' }}>Δ</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r, i) => (
              <tr key={i} style={{ borderTop: `1px solid ${C.grid}` }}>
                <td style={{ padding: '5px 6px', color: C.ink }}>
                  {r.q.length > 80 ? r.q.slice(0, 80) + '…' : r.q}
                  <span style={{ color: C.muted }}> · {r.ds}</span>
                </td>
                <td style={{ padding: '5px 6px', textAlign: 'right', color: C.muted }}>
                  {s100(r.before)}
                </td>
                <td style={{ padding: '5px 6px', textAlign: 'right', color: C.ink }}>
                  {s100(r.after)}
                </td>
                <td
                  style={{
                    padding: '5px 6px',
                    textAlign: 'right',
                    color: r.d < -EPS ? P.bad : r.d > EPS ? P.good : C.muted,
                  }}
                >
                  {sDelta(r.d)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: '8px',
          fontSize: '12px',
          color: C.muted,
          fontFamily: 'var(--font-mono, ui-monospace, monospace)',
        }}
      >
        {rows.length === 0 ? (
          'no queries match'
        ) : (
          <>
            showing {Math.min(limit, rows.length)} of {rows.length}
            {limit < rows.length && (
              <button
                onClick={() => setLimit((v) => v + 25)}
                style={{ ...seg(false), marginLeft: '8px' }}
              >
                show 25 more
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

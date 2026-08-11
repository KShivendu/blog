/* eslint-disable react/display-name */
import { useEffect, useState } from 'react'

// Small multiples instead of one log axis: one panel per decade, LINEAR inside.
// The panel label carries the exponent (read as a category, not a length); the total-term
// count is printed directly so magnitudes are compared by number, not by axis position.

const COLORS = { word: '#94a3b8', r50k: '#38bdf8', o200k: '#10b981' }
const NAMES = { word: 'word', r50k: 'r50k tokens', o200k: 'o200k tokens' }
const powLabel = (k) =>
  k === 0 ? '1' : k < 3 ? String(10 ** k) : k >= 6 ? '1M' : 10 ** (k - 3) + 'k'
const kfmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n))

export default function DecadeFacets({ src, barAreaH = 90 }) {
  const [data, setData] = useState(null)
  const [tok, setTok] = useState('word')
  useEffect(() => {
    let live = true
    fetch(src)
      .then((r) => r.json())
      .then((j) => live && setData(j))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [src])
  if (!data || !data.linfacets)
    return <div style={{ minHeight: barAreaH + 80, margin: '1.5rem 0' }} />

  const facets = data.linfacets[tok]
  const totals = data.decade_counts[tok]

  return (
    <figure className="my-6">
      <div className="mb-3 flex justify-center gap-1.5">
        {Object.keys(NAMES).map((k) => (
          <button
            key={k}
            onClick={() => setTok(k)}
            className={
              'rounded border px-2 py-0.5 text-xs transition-colors ' +
              (k === tok
                ? 'border-transparent bg-gray-800 text-white dark:bg-gray-200 dark:text-gray-900'
                : 'border-gray-300 text-gray-600 hover:border-gray-400 dark:border-gray-600 dark:text-gray-300')
            }
          >
            {NAMES[k]}
          </button>
        ))}
      </div>
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
        }}
      >
        {facets.map((counts, k) => {
          const mx = Math.max(...counts, 1)
          return (
            <div key={k} className="rounded-lg border border-gray-200 p-2 dark:border-gray-700">
              <div className="mb-1 text-center text-xs font-medium text-gray-700 dark:text-gray-200">
                {powLabel(k)}–{powLabel(k + 1)}
              </div>
              <div className="flex items-end justify-center gap-px" style={{ height: barAreaH }}>
                {counts.map((c, b) => (
                  <div
                    key={b}
                    title={`${b + 1}–${b + 2}× · ${c.toLocaleString()} terms`}
                    style={{
                      height: Math.max(1, (c / mx) * barAreaH),
                      width: 7,
                      background: COLORS[tok],
                      borderRadius: '1px 1px 0 0',
                    }}
                  />
                ))}
              </div>
              <div className="mt-1 text-center text-[10px] text-gray-500 dark:text-gray-400">
                {kfmt(totals[k])} terms
              </div>
            </div>
          )
        })}
      </div>
      <figcaption className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
        One panel per order of magnitude (the panel <i>is</i> the exponent); bars inside are a{' '}
        <b>linear</b> sub-histogram (1×–9× of that decade), each panel auto-scaled. The total count
        is printed so you compare magnitudes by number — no log axis to decode.
      </figcaption>
    </figure>
  )
}

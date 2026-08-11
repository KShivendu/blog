/* eslint-disable react/display-name */
import { useEffect, useState } from 'react'

// Per-term frequency histogram: one bar per vocabulary term, its surface string
// written vertically below the bar. Horizontally scrollable so the long tail fits.
// Data (top-N terms per tokenizer) is loaded from `src` at runtime, not inlined.

const COLORS = { word: '#94a3b8', r50k: '#38bdf8', o200k: '#10b981' }
const NAMES = { word: 'word', r50k: 'r50k tokens', o200k: 'o200k tokens' }

// make whitespace / control tokens visible
const show = (t) => (t === '' ? '∅' : t.replace(/ /g, '␣').replace(/\n/g, '⏎').replace(/\t/g, '⇥'))

export default function VocabHistogram({ src, barHeight = 200, barWidth = 18, labelSpace = 150 }) {
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

  if (!data) return <div style={{ minHeight: barHeight + labelSpace + 60, margin: '1.5rem 0' }} />

  const rows = data.vocab[tok]
  const logMax = Math.log10(rows[0][1])

  return (
    <figure className="my-6">
      <div className="mb-2 flex justify-center gap-1.5">
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

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex px-3 pt-3" style={{ width: rows.length * barWidth }}>
          {rows.map(([term, f], i) => {
            const h = Math.max(2, (Math.log10(f) / logMax) * barHeight)
            return (
              <div
                key={i}
                className="flex flex-col items-center"
                style={{ width: barWidth }}
                title={`${show(term)} — ${f.toLocaleString()}`}
              >
                <div style={{ height: barHeight, display: 'flex', alignItems: 'flex-end' }}>
                  <div
                    style={{
                      height: h,
                      width: barWidth - 6,
                      background: COLORS[tok],
                      borderRadius: '2px 2px 0 0',
                    }}
                  />
                </div>
                <div
                  className="mt-1 font-mono text-gray-600 dark:text-gray-300"
                  style={{
                    height: labelSpace,
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                    fontSize: 10,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  {show(term)}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <figcaption className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
        Top {data.n} terms by corpus frequency, one bar each (bar height is log-scaled; hover for
        the exact count). Scroll right → for the tail. ␣ = leading space, ⏎ = newline.
      </figcaption>
    </figure>
  )
}

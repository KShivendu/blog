/* eslint-disable react/display-name */
import { useEffect, useState } from 'react'

// A frequency value wound onto a logarithmic spiral: ONE FULL TURN = one decade (×10).
// Each bead is a term; count the turns between two beads to read orders of magnitude.
// Frequent terms sit on the outer turns, the rare tail crowds the centre (that crowd IS Zipf).

const COLORS = { word: '#94a3b8', r50k: '#38bdf8', o200k: '#10b981' }
const NAMES = { word: 'word', r50k: 'r50k tokens', o200k: 'o200k tokens' }
const show = (t) => (t === '' ? '∅' : t.replace(/ /g, '␣').replace(/\n/g, '⏎'))
const powLabel = (k) =>
  k === 0 ? '1' : k < 3 ? String(10 ** k) : k >= 6 ? '1M' : 10 ** (k - 3) + 'k'
const kfmt = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n))

export default function ZipfSpiral({ src, size = 520 }) {
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
  if (!data || !data.spiral) return <div style={{ minHeight: size, margin: '1.5rem 0' }} />

  const rows = data.spiral[tok]
  const decCounts = (data.decade_counts && data.decade_counts[tok]) || []
  const MAX = data.maxdec || 6
  const cx = size / 2,
    cy = size / 2
  const rMin = 14,
    rMax = size / 2 - 46
  const rOf = (L) => rMin + (Math.min(L, MAX) / MAX) * (rMax - rMin)
  const th = (L) => -2 * Math.PI * L - Math.PI / 2 // decade per turn; integers point up
  const pt = (L) => [cx + rOf(L) * Math.cos(th(L)), cy + rOf(L) * Math.sin(th(L))]

  // spiral guide path
  let path = ''
  for (let s = 0; s <= 600; s++) {
    const L = (MAX * s) / 600
    const [x, y] = pt(L)
    path += (s ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1) + ' '
  }
  const headN = 6

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
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width="100%"
        style={{ maxWidth: size, display: 'block', margin: '0 auto' }}
      >
        {/* decade rings + labels (each ring = one order of magnitude) */}
        {Array.from({ length: MAX }, (_, i) => i + 1).map((k) => (
          <g key={k}>
            <circle
              cx={cx}
              cy={cy}
              r={rOf(k)}
              fill="none"
              className="stroke-gray-200 dark:stroke-gray-700"
              strokeWidth="1"
              strokeDasharray="2 3"
            />
            <text
              x={cx + 3}
              y={cy - rOf(k) + 3}
              fontSize="9"
              className="fill-gray-400 dark:fill-gray-500"
            >
              {powLabel(k)}
              {decCounts[k] != null ? ` · ${kfmt(decCounts[k])} terms` : ''}
            </text>
          </g>
        ))}
        <path d={path} fill="none" stroke={COLORS[tok]} strokeOpacity="0.25" strokeWidth="1" />
        {/* beads */}
        {rows.map(([term, f], i) => {
          const [x, y] = pt(Math.log10(f))
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={i < headN ? 3.2 : 2}
              fill={COLORS[tok]}
              fillOpacity={i < headN ? 1 : 0.6}
            >
              <title>{`${show(term)} — ${f.toLocaleString()}  (10^${Math.log10(f).toFixed(
                2
              )})`}</title>
            </circle>
          )
        })}
        {/* label the frequent head */}
        {rows.slice(0, headN).map(([term, f], i) => {
          const [x, y] = pt(Math.log10(f))
          return (
            <text
              key={i}
              x={x + 5}
              y={y - 4}
              fontSize="10"
              className="fill-gray-700 font-mono dark:fill-gray-200"
            >
              {show(term)}
            </text>
          )
        })}
      </svg>
      <figcaption className="mt-1 text-center text-xs text-gray-500 dark:text-gray-400">
        Each bead is a term; <b>one full turn = ×10 in frequency</b>. Count turns between two beads
        to read how many orders of magnitude apart they are. Frequent terms ride the outer turns;
        the rare tail crowds the centre. Hover a bead for its exact count.
      </figcaption>
    </figure>
  )
}

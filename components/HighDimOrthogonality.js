import { useMemo, useState } from 'react'

// Deterministic PRNG so server and client render identically (no hydration mismatch).
function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function randn(rng) {
  // Box–Muller
  let u = 0,
    v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const NBINS = 49
const M = 300 // sampled vectors -> ~45k pairwise cosines

function experiment(d, seed) {
  const rng = mulberry32((seed * 2654435761 + d * 40503) >>> 0)
  const vecs = []
  for (let i = 0; i < M; i++) {
    const x = new Float64Array(d)
    let n = 0
    for (let k = 0; k < d; k++) {
      x[k] = randn(rng)
      n += x[k] * x[k]
    }
    n = Math.sqrt(n) || 1
    for (let k = 0; k < d; k++) x[k] /= n
    vecs.push(x)
  }
  const hist = new Array(NBINS).fill(0)
  let sumsq = 0,
    near = 0,
    cnt = 0
  for (let i = 0; i < M; i++)
    for (let j = i + 1; j < M; j++) {
      let c = 0
      const a = vecs[i],
        b = vecs[j]
      for (let k = 0; k < d; k++) c += a[k] * b[k]
      const bin = Math.min(NBINS - 1, Math.max(0, Math.floor(((c + 1) / 2) * NBINS)))
      hist[bin]++
      sumsq += c * c
      if (Math.abs(c) < 0.1) near++
      cnt++
    }
  return {
    hist,
    std: Math.sqrt(sumsq / cnt),
    invSqrtD: 1 / Math.sqrt(d),
    fracNear: near / cnt,
    maxBin: Math.max(...hist),
  }
}

const DIMS = [2, 3, 5, 10, 25, 100, 500, 1024]

export default function HighDimOrthogonality() {
  const [d, setD] = useState(3)
  const [seed, setSeed] = useState(1)
  const r = useMemo(() => experiment(d, seed), [d, seed])

  const W = 620,
    H = 230,
    padL = 44,
    padB = 30,
    padT = 8
  const bw = (W - padL - 8) / NBINS
  const binCenter = (i) => -1 + ((i + 0.5) / NBINS) * 2
  const x = (c) => padL + ((c + 1) / 2) * (W - padL - 8)
  const y = (h) => padT + (1 - h / (r.maxBin || 1)) * (H - padT - padB)

  return (
    <div className="my-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500 dark:text-gray-400">dimension d =</span>
        {DIMS.map((dd) => (
          <button
            key={dd}
            onClick={() => setD(dd)}
            className={`rounded px-2.5 py-1 font-mono text-xs transition ${
              d === dd
                ? 'bg-emerald-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {dd}
          </button>
        ))}
        <button
          onClick={() => setSeed((s) => s + 1)}
          className="ml-auto rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          ↻ resample
        </button>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 260 }}>
        {/* x axis ticks */}
        {[-1, -0.5, 0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={H - padB} y2={H - padB + 4} stroke="#9ca3af" />
            <text x={x(t)} y={H - padB + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">
              {t}
            </text>
          </g>
        ))}
        <line x1={x(0)} x2={x(0)} y1={padT} y2={H - padB} stroke="#9ca3af" strokeDasharray="3 3" />
        {/* histogram bars */}
        {r.hist.map((h, i) => (
          <rect
            key={i}
            x={x(binCenter(i)) - bw / 2 + 0.5}
            y={y(h)}
            width={Math.max(1, bw - 1)}
            height={H - padB - y(h)}
            fill="#10b981"
            opacity="0.85"
          />
        ))}
        <text x={padL} y={H - 2} fontSize="10" fill="#9ca3af">
          cosine similarity between two random unit vectors →
        </text>
      </svg>

      <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        At <span className="font-mono">d = {d}</span>, two random unit vectors have cosine{' '}
        <b>0 ± {r.std.toFixed(3)}</b> (theory: 1/√d ={' '}
        <span className="font-mono">{r.invSqrtD.toFixed(3)}</span>).{' '}
        <b>{(r.fracNear * 100).toFixed(0)}%</b> of pairs land within ±0.1 of orthogonal
        {d >= 100 ? ' — almost everything is perpendicular to almost everything else.' : '.'}
      </div>
    </div>
  )
}

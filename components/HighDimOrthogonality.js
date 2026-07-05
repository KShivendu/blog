import { useEffect, useMemo, useState } from 'react'

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
  let u = 0,
    v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const NBINS = 49
const M = 300 // sampled vectors -> ~45k pairwise cosines
// Real jina-embeddings-v3 slices are fetched (reproduced by gen_blog_stats_jina.py):
const DATA_URL = '/static/interactives/data/blog_stats.json'

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
      cnt++
    }
  return { hist, cnt, std: Math.sqrt(sumsq / cnt), invSqrtD: 1 / Math.sqrt(d) }
}

const DIMS = [2, 8, 32, 64, 128, 256, 512, 1024]

// round y-axis tick values from 0 up to max
function niceTicks(max, n = 4) {
  if (!(max > 0)) return { ticks: [0], step: 1 }
  const raw = max / n
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const ticks = []
  for (let v = 0; v <= max + step * 0.5; v += step) ticks.push(v)
  return { ticks, step }
}

export default function HighDimOrthogonality() {
  const [d, setD] = useState(64) // default to a real slice so the overlay is visible
  const [seed, setSeed] = useState(1)
  const [realSlices, setRealSlices] = useState(null)
  const r = useMemo(() => experiment(d, seed), [d, seed])

  useEffect(() => {
    let ok = true
    fetch(DATA_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((j) => ok && j && setRealSlices(j.real_slices))
      .catch(() => {})
    return () => {
      ok = false
    }
  }, [])

  const real = realSlices ? realSlices[String(d)] : null

  const W = 620,
    H = 230,
    padL = 44,
    padB = 30,
    padT = 8
  const bw = (W - padL - 8) / NBINS
  const binCenter = (i) => -1 + ((i + 0.5) / NBINS) * 2
  const x = (c) => padL + ((c + 1) / 2) * (W - padL - 8)
  const randDens = r.hist.map((h) => h / r.cnt)
  const yMax = Math.max(...randDens, ...(real ? real.dens : [0])) || 1
  const y = (dens) => padT + (1 - dens / yMax) * (H - padT - padB)
  const { ticks: yticks } = niceTicks(yMax)
  const pstep = 1
  const pdec = pstep >= 1 ? 0 : 1
  const bars = (dens, fill, opacity) =>
    dens.map((v, i) =>
      v <= 0 ? null : (
        <rect
          key={i}
          x={x(binCenter(i)) - bw / 2 + 0.5}
          y={y(v)}
          width={Math.max(1, bw - 1)}
          height={H - padB - y(v)}
          fill={fill}
          opacity={opacity}
        />
      )
    )

  return (
    <div className="my-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500 dark:text-gray-400">dimension d =</span>
        {DIMS.map((dd) => {
          const hasReal = realSlices
            ? !!realSlices[String(dd)]
            : [32, 64, 128, 256, 512, 1024].includes(dd)
          return (
            <button
              key={dd}
              onClick={() => setD(dd)}
              title={hasReal ? 'has a real jina slice — click to overlay' : undefined}
              className={`rounded px-2.5 py-1 font-mono text-xs transition ${
                hasReal ? 'ring-1 ring-emerald-400/70' : ''
              } ${
                d === dd
                  ? 'bg-amber-500 text-white'
                  : hasReal
                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-300 dark:hover:bg-emerald-900/70'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {dd}
              {hasReal ? ' ●' : ''}
            </button>
          )
        })}
        <button
          onClick={() => setSeed((s) => s + 1)}
          className="ml-auto rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          ↻ resample
        </button>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 260 }}>
        {yticks.map((v) => (
          <g key={`y${v}`}>
            <line x1={padL} x2={W - 8} y1={y(v)} y2={y(v)} stroke="#9ca3af" strokeOpacity="0.15" />
            <text x={padL - 5} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
              {(v * 100).toFixed(pdec)}%
            </text>
          </g>
        ))}
        {[-1, -0.5, 0, 0.5, 1].map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={H - padB} y2={H - padB + 4} stroke="#9ca3af" />
            <text x={x(t)} y={H - padB + 16} textAnchor="middle" fontSize="10" fill="#9ca3af">
              {t}
            </text>
          </g>
        ))}
        <line x1={x(0)} x2={x(0)} y1={padT} y2={H - padB} stroke="#9ca3af" strokeDasharray="3 3" />
        {real && bars(real.dens, '#10b981', 0.55)}
        {bars(randDens, '#f59e0b', 0.8)}
        <text x={padL} y={H - 2} fontSize="10" fill="#9ca3af">
          cosine similarity between two vectors →
        </text>
      </svg>

      <div className="mt-1 flex gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>
          <span
            style={{ background: '#f59e0b' }}
            className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
          />
          random (d = {d})
        </span>
        {real && (
          <span>
            <span
              style={{ background: '#10b981' }}
              className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
            />
            real sentences (d = {d})
          </span>
        )}
        <span className="ml-auto">y = % of pairs per bin</span>
      </div>

      <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        At <span className="font-mono">d = {d}</span>, two random unit vectors have cosine{' '}
        <b>0 ± {r.std.toFixed(3)}</b> (theory: 1/√d ={' '}
        <span className="font-mono">{r.invSqrtD.toFixed(3)}</span>).{' '}
        {real ? (
          <>
            And real jina sentence embeddings? Also a hump close to 0 — mean cosine just{' '}
            <b style={{ color: '#10b981' }}>+{real.mean}</b> at this slice. A random pair of{' '}
            <em>unrelated</em> sentences (a company and a plant) <em>should</em> be ~perpendicular,
            so near-zero average similarity isn&apos;t a flaw — it&apos;s correct. The structure
            isn&apos;t in this average at all; it&apos;s in the <b>tail</b> (a real vector&apos;s
            nearest neighbour sits at ~0.55, not 0.10 — the bar above) and in the <b>clusters</b>{' '}
            (the globe below). Random has neither.
          </>
        ) : (
          <>
            No real jina slice at this dimension — click a ringed{' '}
            <b className="text-emerald-600 dark:text-emerald-400">green ●</b> dimension (32–1024) to
            overlay real embeddings at the same d.
          </>
        )}
      </div>
    </div>
  )
}

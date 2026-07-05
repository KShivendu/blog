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
  let u = 0,
    v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

const NBINS = 49
const M = 300 // sampled vectors -> ~45k pairwise cosines

// Real mxbai pairwise-cosine distributions at its genuine Matryoshka slices (density over the
// same 49 bins, from 1,500 embeddings). Real pairs stay a broad hump at +0.35–0.39 at EVERY
// slice; the spread just narrows with dimension. Random, at the same dim, sits at 0.
const REAL_SLICES = {
  64: {
    mean: 0.357,
    std: 0.121,
    dens: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.0001, 0.0003, 0.0009, 0.0025,
      0.0055, 0.0113, 0.0218, 0.037, 0.0585, 0.0828, 0.108, 0.1266, 0.1337, 0.1261, 0.1065, 0.0793,
      0.0508, 0.0279, 0.0128, 0.0051, 0.0017, 0.0005, 0.0001, 0, 0, 0, 0, 0,
    ],
  },
  128: {
    mean: 0.354,
    std: 0.093,
    dens: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.0002, 0.0007,
      0.0026, 0.0081, 0.0217, 0.0471, 0.0874, 0.1341, 0.1696, 0.1751, 0.1482, 0.1023, 0.0578,
      0.0274, 0.0111, 0.0041, 0.0017, 0.0006, 0.0002, 0, 0, 0, 0, 0, 0,
    ],
  },
  256: {
    mean: 0.347,
    std: 0.078,
    dens: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.0004, 0.0027,
      0.0116, 0.0374, 0.0892, 0.1582, 0.2079, 0.2032, 0.1478, 0.0822, 0.0363, 0.0142, 0.0053,
      0.0022, 0.0009, 0.0003, 0.0001, 0, 0, 0, 0, 0, 0,
    ],
  },
  512: {
    mean: 0.35,
    std: 0.069,
    dens: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.0005,
      0.004, 0.021, 0.074, 0.163, 0.2375, 0.2279, 0.1506, 0.0739, 0.0292, 0.0107, 0.0044, 0.002,
      0.0008, 0.0003, 0.0001, 0, 0, 0, 0, 0, 0,
    ],
  },
  1024: {
    mean: 0.389,
    std: 0.06,
    dens: [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.001,
      0.0102, 0.0575, 0.1709, 0.276, 0.2532, 0.1429, 0.0575, 0.019, 0.007, 0.003, 0.0012, 0.0004,
      0.0001, 0, 0, 0, 0, 0, 0,
    ],
  },
}

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
  return { hist, cnt, std: Math.sqrt(sumsq / cnt), invSqrtD: 1 / Math.sqrt(d) }
}

const DIMS = [2, 8, 32, 64, 128, 256, 512, 1024]

// round y-axis tick values from 0 up to max
function niceTicks(max, n = 4) {
  if (!(max > 0)) return [0]
  const raw = max / n
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const ticks = []
  for (let v = 0; v <= max + step * 0.5; v += step) ticks.push(v)
  return { ticks, step }
}

export default function HighDimOrthogonality() {
  const [d, setD] = useState(64) // default to a real slice so the overlay is discovered
  const [seed, setSeed] = useState(1)
  const r = useMemo(() => experiment(d, seed), [d, seed])
  const real = REAL_SLICES[d]

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
  const { ticks: yticks, step: ystep } = niceTicks(yMax)
  const pstep = ystep * 100 // ticks shown as % of pairs (densities sum to 1 -> ×100 = percent)
  const pdec = pstep >= 1 ? 0 : pstep >= 0.1 ? 1 : 2
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
          const hasReal = !!REAL_SLICES[dd]
          return (
            <button
              key={dd}
              onClick={() => setD(dd)}
              title={hasReal ? 'has a real mxbai slice — click to overlay' : undefined}
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
        {bars(randDens, '#f59e0b', 0.85)}
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
            real mxbai (d = {d} slice)
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
            Real mxbai at the very same dimension sits at{' '}
            <b>
              +{real.mean} ± {real.std}
            </b>{' '}
            — a whole different distribution, shifted right and nowhere near orthogonal. Random
            collapses onto 0 as <span className="font-mono">d</span> grows; real stays a hump at
            ~+0.35 at <em>every</em> slice. That gap is what search runs on.
          </>
        ) : (
          <>
            No real mxbai slice at this dimension — click a ringed{' '}
            <b className="text-emerald-600 dark:text-emerald-400">green ●</b> dimension (64–1024) to
            overlay real embeddings at the same d.
          </>
        )}
      </div>
    </div>
  )
}

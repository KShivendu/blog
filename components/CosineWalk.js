import { useEffect, useMemo, useState } from 'react'

// A cosine is the running sum of 1024 component products. This draws that walk for a live
// random pair plus measured real pairs (cross-topic / same-topic / nearest-neighbour), with a
// "center vectors" toggle. Real data from gen_cosine_walk.py; random computed here (seeded).
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

const D = 1024
const STEP = 4 // walk stored every 4 components (matches the data file)
const DATA_URL = '/static/interactives/data/cosine_walk.json'
const TYPES = [
  ['random', 'random', '#f59e0b'],
  ['cross', 'different topic', '#94a3b8'],
  ['same', 'same topic', '#34d399'],
  ['nn', 'nearest neighbours', '#059669'],
]
const COL = Object.fromEntries(TYPES.map(([k, , c]) => [k, c]))

// random pair: two unit vectors, cumulative product sum sampled every STEP + stats
function randomWalk(seed) {
  const rng = mulberry32((seed * 2654435761 + 99991) >>> 0)
  const mk = () => {
    const x = new Float64Array(D)
    let n = 0
    for (let k = 0; k < D; k++) {
      x[k] = randn(rng)
      n += x[k] * x[k]
    }
    n = Math.sqrt(n) || 1
    for (let k = 0; k < D; k++) x[k] /= n
    return x
  }
  const a = mk(),
    b = mk()
  const walk = []
  let c = 0,
    g = 0,
    pos = 0
  for (let k = 0; k < D; k++) {
    const p = a[k] * b[k]
    c += p
    g += Math.abs(p)
    if (p > 0) pos++
    if ((k + 1) % STEP === 0) walk.push(c)
  }
  return {
    walk,
    stats: {
      cos: Math.round(c * 1000) / 1000,
      gross: Math.round(g * 1000) / 1000,
      surv: Math.round((100 * Math.abs(c)) / g),
      pos: Math.round((100 * pos) / D),
    },
  }
}

const W = 660,
  H = 320,
  padL = 42,
  padR = 132,
  padT = 12,
  padB = 30
const YMIN = -0.1,
  YMAX = 0.62
const rnd = (v) => Math.round(v * 100) / 100
const x = (k) => rnd(padL + (k / D) * (W - padL - padR)) // k = component count 0..1024
const y = (v) => rnd(padT + ((YMAX - v) / (YMAX - YMIN)) * (H - padT - padB))
const path = (walk) => 'M' + walk.map((v, i) => `${x((i + 1) * STEP)} ${y(v)}`).join(' L')

// ±2σ envelope of a random walk: partial sum of k products has σ = √k / d
function noiseBand() {
  const up = [],
    dn = []
  for (let k = 0; k <= D; k += 32) {
    const s = (2 * Math.sqrt(k)) / D
    up.push(`${x(k)} ${y(s)}`)
    dn.unshift(`${x(k)} ${y(-s)}`)
  }
  return `M${up.join(' L')} L${dn.join(' L')} Z`
}
const BAND = noiseBand()

export default function CosineWalk() {
  const [sel, setSel] = useState('nn')
  const [centered, setCentered] = useState(false)
  const [ex, setEx] = useState(0) // example index (real) — also reseeds random
  const [real, setReal] = useState(null)

  useEffect(() => {
    let live = true
    fetch(DATA_URL)
      .then((r) => r.json())
      .then((j) => live && setReal(j))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const rand = useMemo(() => randomWalk(ex + 1), [ex])

  // per-type current walk + stats (centered only affects real pairs; random has no shared mean)
  const cur = (t) => {
    if (t === 'random') return { walk: rand.walk, stats: rand.stats }
    if (!real) return null
    const e = real.types[t][ex % real.types[t].length]
    return centered ? { walk: e.walk_c, stats: e.stats_c, e } : { walk: e.walk, stats: e.stats, e }
  }
  const selCur = cur(sel)
  const selE = selCur && selCur.e

  // gauge numbers for the selected pair: pos-sum and neg-sum from gross & net
  const gaugeMax = 0.8
  const g = selCur ? selCur.stats : null
  const posSum = g ? (g.gross + g.cos) / 2 : 0
  const negSum = g ? (g.gross - g.cos) / 2 : 0

  return (
    <div className="my-6 rounded-lg border border-gray-200 p-4 text-gray-900 dark:border-gray-700 dark:text-gray-100">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        {TYPES.map(([k, label, c]) => (
          <button
            key={k}
            onClick={() => setSel(k)}
            className={`rounded px-2.5 py-1 text-xs transition ${
              sel === k
                ? 'text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
            style={sel === k ? { background: c } : undefined}
          >
            {label}
          </button>
        ))}
        <label className="ml-2 inline-flex cursor-pointer items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={centered}
            onChange={(e) => setCentered(e.target.checked)}
          />
          center vectors
        </label>
        <button
          onClick={() => setEx((v) => v + 1)}
          className="ml-auto rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          ↻ new pair
        </button>
      </div>

      <div className="mb-1 min-h-[2.5rem] text-xs text-gray-500 dark:text-gray-400">
        {sel === 'random' ? (
          <>two freshly generated random unit vectors — 1024 components each, no meaning attached</>
        ) : selE ? (
          <>
            “{selE.ta}” <span className="text-gray-400">({selE.ca})</span>
            <span className="mx-1 font-bold">×</span> “{selE.tb}”{' '}
            <span className="text-gray-400">({selE.cb})</span>
          </>
        ) : (
          <>loading…</>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 340 }}>
        {/* y gridlines */}
        {[0, 0.2, 0.4, 0.6].map((v) => (
          <g key={v}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(v)}
              y2={y(v)}
              stroke="#9ca3af"
              strokeOpacity={v === 0 ? 0.45 : 0.15}
            />
            <text x={padL - 5} y={y(v) + 3} textAnchor="end" fontSize="9" fill="#9ca3af">
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {/* ±2σ random-walk noise band */}
        <path d={BAND} fill="#f59e0b" opacity="0.12" />
        <text x={x(430)} y={y(0) + 12} fontSize="9" fill="#b45309" opacity="0.8">
          ±2σ band: where a random walk stays
        </text>
        {/* walks */}
        {TYPES.map(([k]) => {
          const c = cur(k)
          if (!c) return null
          const last = c.walk[c.walk.length - 1]
          const on = sel === k
          return (
            <g key={k}>
              <path
                d={path(c.walk)}
                fill="none"
                stroke={COL[k]}
                strokeWidth={on ? 2.4 : 1.3}
                opacity={on ? 1 : 0.45}
              />
              <circle cx={x(D)} cy={y(last)} r={on ? 3.5 : 2.5} fill={COL[k]} />
              <text
                x={x(D) + 6}
                y={y(last) + 3}
                fontSize="10"
                fill={COL[k]}
                fontWeight={on ? 700 : 400}
              >
                {last >= 0 ? '+' : ''}
                {last.toFixed(2)}{' '}
                {k === 'nn'
                  ? 'neighbours'
                  : k === 'same'
                  ? 'same topic'
                  : k === 'cross'
                  ? 'diff. topic'
                  : 'random'}
              </text>
            </g>
          )
        })}
        <text x={(padL + W - padR) / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="#9ca3af">
          running total of the 1024 products a₁b₁ + a₂b₂ + … (left → right); the endpoint is the
          cosine
        </text>
      </svg>

      {/* gauge: where the selected cosine comes from */}
      {g && (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-gray-600 dark:text-gray-300">
          <span className="inline-flex items-center gap-1.5">
            products &gt; 0 sum to
            <span
              className="inline-block h-2.5 rounded-sm"
              style={{ width: `${(140 * posSum) / gaugeMax}px`, background: '#10b981' }}
            />
            <b>+{posSum.toFixed(2)}</b>
          </span>
          <span className="inline-flex items-center gap-1.5">
            products &lt; 0 sum to
            <span
              className="inline-block h-2.5 rounded-sm"
              style={{ width: `${(140 * negSum) / gaugeMax}px`, background: '#f87171' }}
            />
            <b>−{negSum.toFixed(2)}</b>
          </span>
          <span>
            net (the cosine):{' '}
            <b>
              {g.cos >= 0 ? '+' : ''}
              {g.cos.toFixed(2)}
            </b>{' '}
            — {g.surv}% of the gross survives cancellation · {g.pos}% of products are positive
          </span>
        </div>
      )}
    </div>
  )
}

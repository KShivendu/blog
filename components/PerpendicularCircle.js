import { useEffect, useMemo, useState } from 'react'

// Deterministic PRNG so server and client first paint match (no hydration mismatch).
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

const DIMS = [2, 8, 32, 64, 128, 256, 512, 1024]
const REAL_DIMS = [32, 64, 128, 256, 512, 1024]
const M = 250 // random vectors sampled
const DATA_URL = '/static/interactives/data/perp_circle.json'

// cosines of M-1 random unit vectors to a fixed random anchor, in d dims
function randomCosines(d, seed) {
  const rng = mulberry32((seed * 2654435761 + d * 40503) >>> 0)
  const mk = () => {
    const x = new Float64Array(d)
    let n = 0
    for (let k = 0; k < d; k++) {
      x[k] = randn(rng)
      n += x[k] * x[k]
    }
    n = Math.sqrt(n) || 1
    for (let k = 0; k < d; k++) x[k] /= n
    return x
  }
  const a = mk()
  const cos = []
  for (let i = 0; i < M - 1; i++) {
    const b = mk()
    let c = 0
    for (let k = 0; k < d; k++) c += a[k] * b[k]
    cos.push(c)
  }
  return cos
}

const W = 620,
  H = 360,
  cx = W / 2,
  cy = H - 46,
  R = Math.min(W / 2 - 40, H - 96)
const rnd = (v) => Math.round(v * 100) / 100

// Angle mode: angle from the 0° axis = arccos(cosine to the anchor). The radius is deliberately
// a decorative jitter (a golden-ratio hash of the point index) so overlapping dots stay visible —
// it carries no data.
function place(cos, i) {
  const th = Math.acos(Math.max(-1, Math.min(1, cos)))
  const jit = (i * 0.61803989) % 1
  const r = R * (0.66 + 0.3 * jit)
  return { x: rnd(cx + r * Math.cos(th)), y: rnd(cy - r * Math.sin(th)) }
}

// rim tick at a given angle (degrees), just outside the arc
function rimTick(deg) {
  const th = (deg * Math.PI) / 180
  return {
    x1: rnd(cx + R * Math.cos(th)),
    y1: rnd(cy - R * Math.sin(th)),
    x2: rnd(cx + (R + 7) * Math.cos(th)),
    y2: rnd(cy - (R + 7) * Math.sin(th)),
    lx: rnd(cx + (R + 22) * Math.cos(th)),
    ly: rnd(cy - (R + 22) * Math.sin(th)),
  }
}

export default function PerpendicularCircle() {
  const [d, setD] = useState(1024)
  const [seed, setSeed] = useState(1)
  const [anchor, setAnchor] = useState(0)
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

  const randCos = useMemo(() => randomCosines(d, seed), [d, seed])
  const realCos =
    real && REAL_DIMS.includes(d) ? real.anchors[anchor % real.anchors.length][d] : null
  const nnear = real ? real.nnear : 0

  const near = (arr) => (100 * arr.filter((c) => Math.abs(c) < 0.1).length) / arr.length
  const randPerp = near(randCos).toFixed(0)
  const realPerp = realCos ? near(realCos).toFixed(0) : null

  const dot = (p, i, fill, op) => (
    <circle key={i} cx={p.x} cy={p.y} r={2.6} fill={fill} opacity={op} />
  )
  const topY = cy - R

  return (
    <div className="my-6 rounded-lg border border-gray-200 p-4 text-gray-900 dark:border-gray-700 dark:text-gray-100">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500 dark:text-gray-400">dimension d =</span>
        {DIMS.map((dd) => {
          const hasReal = REAL_DIMS.includes(dd)
          return (
            <button
              key={dd}
              onClick={() => setD(dd)}
              title={hasReal ? 'has a real jina slice — overlaid in green' : undefined}
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
          onClick={() => {
            setSeed((s) => s + 1)
            setAnchor((a) => a + 1)
          }}
          className="ml-auto rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          ↻ new point
        </button>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 380 }}>
        {/* axes */}
        <line
          x1={cx - R - 26}
          x2={cx + R + 26}
          y1={cy}
          y2={cy}
          stroke="#9ca3af"
          strokeOpacity="0.25"
        />
        <line x1={cx} x2={cx} y1={cy + 10} y2={cy - R - 26} stroke="#9ca3af" strokeOpacity="0.25" />
        {/* upper semicircle rim */}
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none"
          stroke="#9ca3af"
          strokeOpacity="0.3"
        />
        {/* angle ticks + labels along the rim */}
        {[
          [45, '45°'],
          [135, '135°'],
        ].map(([deg, lbl]) => {
          const t = rimTick(deg)
          return (
            <g key={deg}>
              <line x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="#9ca3af" strokeOpacity="0.5" />
              <text x={t.lx} y={t.ly + 3} textAnchor="middle" fontSize="10" fill="#9ca3af">
                {lbl}
              </text>
            </g>
          )
        })}
        {/* 90° perpendicular reference */}
        <line
          x1={cx}
          x2={cx}
          y1={cy}
          y2={topY}
          stroke="#f59e0b"
          strokeOpacity="0.5"
          strokeDasharray="4 4"
        />
        <text
          x={cx}
          y={topY - 10}
          textAnchor="middle"
          fontSize="12"
          fill="#f59e0b"
          fillOpacity="0.9"
        >
          90° · unrelated (⟂, cos = 0)
        </text>
        <text x={cx - R - 4} y={cy + 16} textAnchor="start" fontSize="10.5" fill="#9ca3af">
          180° · disagree (opposite, cos = −1)
        </text>
        {/* points: real (green) behind, random (yellow) in front */}
        {realCos &&
          realCos.map((c, i) => dot(place(c, i), 'r' + i, '#10b981', i < nnear ? 0.95 : 0.6))}
        {randCos.map((c, i) => dot(place(c, i), 'a' + i, '#f59e0b', 0.75))}
        {/* anchor = your point at 0° */}
        <circle cx={cx + R} cy={cy} r={6} fill="currentColor" />
        <text x={cx + R} y={cy + 18} textAnchor="end" fontSize="11" fill="currentColor">
          your point · agree (0°, cos = 1)
        </text>
        <text x={cx} y={H - 4} textAnchor="middle" fontSize="10" fill="#9ca3af">
          each dot = another vector at its true angle to yours — 0° agrees, 90° unrelated, 180°
          disagrees
        </text>
      </svg>

      <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>
          <span
            style={{ background: '#f59e0b' }}
            className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
          />
          random (d = {d})
        </span>
        {realCos && (
          <span>
            <span
              style={{ background: '#10b981' }}
              className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
            />
            real jina sentences (d = {d})
          </span>
        )}
        <span className="ml-auto italic">radius = jitter (spacing only), not data</span>
      </div>

      <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        The angle from the <b>0°</b> axis (your point) is the vector&apos;s true angle to yours —
        straight up at <b style={{ color: '#f59e0b' }}>90°</b> means <b>unrelated</b>{' '}
        (perpendicular, cosine 0). At <span className="font-mono">d = {d}</span>, <b>{randPerp}%</b>{' '}
        of random vectors sit within ±0.1 of that 90° line — effectively unrelated to your point.{' '}
        {realCos ? (
          <>
            The <b style={{ color: '#10b981' }}>real jina</b> cloud crowds it too —{' '}
            <b>{realPerp}%</b> within ±0.1 of 90°, so real sentences are mostly unrelated on average
            as well — but unlike random it trails a warm tail of genuine nearest neighbours peeling
            toward 0° (agreement). That tail, not the average, is the structure, and it barely fades
            as you truncate the dimension. (Distance from the centre is only jitter so the dots
            don&apos;t overlap — read the angle, not the radius.)
          </>
        ) : (
          <>
            Pick a ringed <b className="text-emerald-600 dark:text-emerald-400">green ●</b>{' '}
            dimension to overlay real embeddings. (Distance from the centre is only jitter so the
            dots don&apos;t overlap — read the angle, not the radius.)
          </>
        )}
      </div>
    </div>
  )
}

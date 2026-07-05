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
const MODES = [
  ['angle', '∡ angle'],
  ['project', '⊕ PC1 map'],
  ['density', '◎ density'],
]

// Random baseline computed in-browser: for M unit vectors, relative to anchor a and a second
// reference b (both random), return each other point's cos-to-a, its component along b⊥, and its
// nearest-neighbour cosine within the sample. Mirrors the three quantities stored for real data.
function computeRandom(d, seed) {
  const rng = mulberry32((seed * 2654435761 + d * 40503) >>> 0)
  const vecs = []
  for (let n = 0; n < M; n++) {
    const x = new Float64Array(d)
    let s = 0
    for (let k = 0; k < d; k++) {
      x[k] = randn(rng)
      s += x[k] * x[k]
    }
    s = Math.sqrt(s) || 1
    for (let k = 0; k < d; k++) x[k] /= s
    vecs.push(x)
  }
  const a = vecs[0]
  const b = vecs[1]
  let ba = 0
  for (let k = 0; k < d; k++) ba += b[k] * a[k]
  const bperp = new Float64Array(d)
  let bn = 0
  for (let k = 0; k < d; k++) {
    bperp[k] = b[k] - ba * a[k]
    bn += bperp[k] * bperp[k]
  }
  bn = Math.sqrt(bn) || 1
  for (let k = 0; k < d; k++) bperp[k] /= bn
  const others = vecs.slice(2)
  const cos = [],
    y1 = []
  for (const v of others) {
    let ca = 0,
      cb = 0
    for (let k = 0; k < d; k++) {
      ca += v[k] * a[k]
      cb += v[k] * bperp[k]
    }
    cos.push(ca)
    y1.push(cb)
  }
  const nn = others.map((v, i) => {
    let best = -2
    for (let j = 0; j < others.length; j++) {
      if (j === i) continue
      const w = others[j]
      let c = 0
      for (let k = 0; k < d; k++) c += v[k] * w[k]
      if (c > best) best = c
    }
    return best
  })
  return { cos, y1, nn }
}

const W = 620,
  H = 360
const rnd = (v) => Math.round(v * 100) / 100
const c1 = (v) => Math.max(-1, Math.min(1, v))
const c01 = (v) => Math.max(0, Math.min(1, v))
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)

export default function PerpendicularCircle() {
  const [d, setD] = useState(1024)
  const [seed, setSeed] = useState(1)
  const [anchor, setAnchor] = useState(0)
  const [mode, setMode] = useState('angle')
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

  const rand = useMemo(() => computeRandom(d, seed), [d, seed])
  const realData =
    real && REAL_DIMS.includes(d) ? real.anchors[anchor % real.anchors.length][d] : null
  const nnear = real ? real.nnear : 0

  // geometry — projection is a centred full disc; angle/density are an upper semicircle
  const proj = mode === 'project'
  const cx = W / 2
  const cy = proj ? H / 2 : H - 46
  const R = proj ? Math.min(W, H) / 2 - 34 : Math.min(W / 2 - 40, H - 96)

  function place(pt, i) {
    if (mode === 'project') return { x: rnd(cx + R * c1(pt.cos)), y: rnd(cy - R * c1(pt.y1)) }
    const th = Math.acos(c1(pt.cos))
    let r
    if (mode === 'density') r = R * (0.3 + 0.65 * c01(pt.nn))
    else {
      const jit = (i * 0.61803989) % 1
      r = R * (0.66 + 0.3 * jit)
    }
    return { x: rnd(cx + r * Math.cos(th)), y: rnd(cy - r * Math.sin(th)) }
  }
  const pts = (obj) =>
    obj ? obj.cos.map((c, i) => ({ cos: c, y1: obj.y1[i], nn: obj.nn[i], i })) : []

  const dot = (p, i, fill, op) => (
    <circle key={i} cx={p.x} cy={p.y} r={2.6} fill={fill} opacity={op} />
  )
  const topY = cy - R
  const anchorPt = { x: cx + R, y: cy }

  // readout stats
  const near = (arr) => (100 * arr.filter((c) => Math.abs(c) < 0.1).length) / arr.length
  const randPerp = near(rand.cos).toFixed(0)
  const realPerp = realData ? near(realData.cos).toFixed(0) : null
  const randNN = mean(rand.nn).toFixed(2)
  const realNN = realData ? mean(realData.nn).toFixed(2) : null
  const radOf = (o) => o.cos.map((c, i) => Math.hypot(c, o.y1[i]))
  const randRad = mean(radOf(rand)).toFixed(2)
  const realRad = realData ? mean(radOf(realData)).toFixed(2) : null

  return (
    <div className="my-6 rounded-lg border border-gray-200 p-4 text-gray-900 dark:border-gray-700 dark:text-gray-100">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
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
      <div className="mb-3 inline-flex overflow-hidden rounded border border-gray-300 dark:border-gray-600">
        {MODES.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={`px-2.5 py-1 text-xs transition ${
              mode === k
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 380 }}>
        {/* axes */}
        <line
          x1={cx - R - 16}
          x2={cx + R + 16}
          y1={cy}
          y2={cy}
          stroke="#9ca3af"
          strokeOpacity="0.25"
        />
        <line
          x1={cx}
          x2={cx}
          y1={proj ? cy + R + 14 : cy + 10}
          y2={cy - R - 18}
          stroke="#9ca3af"
          strokeOpacity="0.25"
        />
        <circle cx={cx} cy={cy} r={R} fill="none" stroke="#9ca3af" strokeOpacity="0.3" />
        {/* 90° reference (perpendicular-to-anchor axis) */}
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
          y={topY - 8}
          textAnchor="middle"
          fontSize="12"
          fill="#f59e0b"
          fillOpacity="0.9"
        >
          {proj ? 'x = 0 ⟂ to your point' : '90° ⟂ orthogonal'}
        </text>
        {!proj && (
          <text x={cx - R} y={cy + 18} textAnchor="start" fontSize="11" fill="#9ca3af">
            180° opposite
          </text>
        )}
        {/* real (green) behind, random (amber) in front */}
        {realData &&
          pts(realData).map((p) =>
            dot(place(p, p.i), 'r' + p.i, '#10b981', p.i < nnear ? 0.95 : 0.6)
          )}
        {pts(rand).map((p) => dot(place(p, p.i), 'a' + p.i, '#f59e0b', 0.75))}
        {/* anchor = your point */}
        <circle cx={anchorPt.x} cy={anchorPt.y} r={6} fill="currentColor" />
        <text
          x={anchorPt.x - 10}
          y={anchorPt.y - 10}
          textAnchor="end"
          fontSize="12"
          fill="currentColor"
        >
          your point{proj ? '' : ' (0°)'}
        </text>
        <text x={cx} y={H - 4} textAnchor="middle" fontSize="10" fill="#9ca3af">
          {mode === 'project'
            ? 'x = cosine to your point (exact) · y = component along the cloud’s top axis (PC1)'
            : mode === 'density'
            ? 'angle = cosine to your point · radius = the point’s own nearest-neighbour cosine'
            : 'each dot = a vector at its true angle to yours · radius is only spacing'}
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
        {realData && (
          <span>
            <span
              style={{ background: '#10b981' }}
              className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle"
            />
            real jina sentences (d = {d})
          </span>
        )}
      </div>

      <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        {mode === 'angle' && (
          <>
            At <span className="font-mono">d = {d}</span>, <b>{randPerp}%</b> of random vectors land
            within ±0.1 cosine of the <b style={{ color: '#f59e0b' }}>90° perpendicular</b> line.{' '}
            {realData ? (
              <>
                The <b style={{ color: '#10b981' }}>real jina</b> cloud crowds the same line —{' '}
                <b>{realPerp}%</b> of it is within ±0.1 of 90° too — but unlike random it trails a
                warm tail of genuine nearest neighbours reaching down toward 0°. That tail, not the
                average, is the structure.
              </>
            ) : (
              <>Pick a ringed green ● dimension to overlay real embeddings.</>
            )}
          </>
        )}
        {mode === 'project' && (
          <>
            A genuine 2-D map: <b>x = cosine to your point</b> (exact),{' '}
            <b>y = component along the cloud’s top axis</b> (PC1, with the anchor direction removed)
            — both real dot products.{' '}
            {realData ? (
              <>
                Random collapses toward the <b>centre</b> (mean projected radius <b>{randRad}</b>):
                a random vector has almost no component in any fixed plane. The{' '}
                <b style={{ color: '#10b981' }}>real</b> cloud spreads out (radius <b>{realRad}</b>
                ), and its true neighbours shoot toward your point along the x-axis. The catch: this
                radius is real but relative to an <em>arbitrary</em> second axis — pick a different
                one and the spread changes.
              </>
            ) : (
              <>Pick a ringed green ● dimension to overlay real embeddings.</>
            )}
          </>
        )}
        {mode === 'density' && (
          <>
            Same angle as before (cosine to your point), but now{' '}
            <b>radius = each point’s own nearest- neighbour cosine</b> — rim = has a close
            neighbour, centre = isolated.{' '}
            {realData ? (
              <>
                <b style={{ color: '#10b981' }}>Real</b> points ride the rim (mean nn{' '}
                <b>{realNN}</b>) — nearly every one has a genuine neighbour.{' '}
                <b style={{ color: '#f59e0b' }}>Random</b> huddles near the centre (mean nn{' '}
                <b>{randNN}</b>): no point has anyone close. This is the structure the angle can’t
                show — and it needs no second reference.
              </>
            ) : (
              <>Pick a ringed green ● dimension to overlay real embeddings.</>
            )}
          </>
        )}
      </div>
    </div>
  )
}

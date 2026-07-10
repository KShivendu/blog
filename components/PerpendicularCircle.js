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
  const [sel, setSel] = useState(null) // {type:'a'|'r', i} — a locked dot, tracked across dims
  const [hover, setHover] = useState(null) // {type:'r', i} — green dot under the cursor

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
  const anchorRec = real ? real.anchors[anchor % real.anchors.length] : null
  const realCos = anchorRec && REAL_DIMS.includes(d) ? anchorRec[d] : null
  const realTexts = anchorRec && REAL_DIMS.includes(d) ? anchorRec.texts : null
  const anchorText = anchorRec ? anchorRec.anchor_text : null
  const nnear = real ? real.nnear : 0

  // sentence to show below the disc: hovered green dot wins, else the locked dot
  let activeText = null,
    activeLabel = null,
    activeColor = null,
    activeQuote = false
  if (hover && hover.type === 'r' && realTexts) {
    activeText = realTexts[hover.i]
    activeLabel = hover.i < nnear ? 'hovering · true nearest ★' : 'hovering'
    activeColor = '#10b981'
    activeQuote = true
  } else if (sel) {
    activeLabel = 'locked'
    if (sel.type === 'r') {
      activeColor = '#10b981'
      if (realTexts) {
        activeText = realTexts[sel.i]
        activeQuote = true
        if (sel.i < nnear) activeLabel = 'locked · true nearest ★'
      } else activeText = '(pick a green ● dimension to read this point)'
    } else {
      activeColor = '#f59e0b'
      activeText = 'random vector — no sentence'
    }
  }

  const near = (arr) => (100 * arr.filter((c) => Math.abs(c) < 0.1).length) / arr.length
  const randPerp = near(randCos).toFixed(0)
  const realPerp = realCos ? near(realCos).toFixed(0) : null

  const dot = (p, key, fill, op, type, idx, hoverable, near) => (
    <circle
      key={key}
      cx={p.x}
      cy={p.y}
      r={near ? 3.4 : 2.6}
      fill={fill}
      opacity={op}
      stroke={near ? 'currentColor' : undefined}
      strokeWidth={near ? 1 : undefined}
      style={{ cursor: 'pointer' }}
      onClick={() => setSel((s) => (s && s.type === type && s.i === idx ? null : { type, i: idx }))}
      onMouseEnter={hoverable ? () => setHover({ type, i: idx }) : undefined}
      onMouseLeave={hoverable ? () => setHover(null) : undefined}
    />
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
            setSel(null)
            setHover(null)
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
          90° · neutralized (⟂, cos = 0)
        </text>
        <text x={cx - R - 4} y={cy + 16} textAnchor="start" fontSize="10.5" fill="#9ca3af">
          180° · against you (cos = −1)
        </text>
        {/* points: real (green) behind, random (yellow) in front */}
        {realCos &&
          realCos.map((c, i) => {
            const near = i < nnear
            return dot(
              place(c, i),
              'r' + i,
              near ? '#34d399' : '#10b981',
              near ? 1 : 0.5,
              'r',
              i,
              true,
              near
            )
          })}
        {randCos.map((c, i) => dot(place(c, i), 'a' + i, '#f59e0b', 0.75, 'a', i, false))}
        {/* hovered green dot: ring */}
        {hover &&
          hover.type === 'r' &&
          realCos &&
          (() => {
            const p = place(realCos[hover.i], hover.i)
            return <circle cx={p.x} cy={p.y} r={5} fill="none" stroke="#10b981" strokeWidth="2" />
          })()}
        {/* locked dot: tracked across dims — radial guide + ring + cos/angle label */}
        {sel &&
          (() => {
            const cur = sel.type === 'a' ? randCos[sel.i] : realCos ? realCos[sel.i] : null
            if (cur == null) return null
            const p = place(cur, sel.i)
            const col = sel.type === 'a' ? '#f59e0b' : '#10b981'
            const deg = Math.round((Math.acos(Math.max(-1, Math.min(1, cur))) * 180) / Math.PI)
            return (
              <g>
                <line
                  x1={cx}
                  y1={cy}
                  x2={p.x}
                  y2={p.y}
                  stroke={col}
                  strokeOpacity="0.55"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={6}
                  fill={col}
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fill="currentColor">
                  {(cur >= 0 ? '+' : '') + cur.toFixed(2)} · {deg}°
                </text>
              </g>
            )
          })()}
        {/* anchor = your point at 0° */}
        <circle cx={cx + R} cy={cy} r={6} fill="currentColor" />
        <text x={cx + R} y={cy + 18} textAnchor="end" fontSize="11" fill="currentColor">
          your point · fully with you (0°, cos = 1)
        </text>
        <text x={cx} y={H - 4} textAnchor="middle" fontSize="10" fill="#9ca3af">
          each dot votes on your point — 0° with you, 90° neutralized, 180° against; the cosine is
          the vote strength
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
        {realCos && (
          <span>
            <span
              style={{ background: '#34d399' }}
              className="mr-1 inline-block h-2.5 w-2.5 rounded-full align-middle ring-1 ring-current"
            />
            true nearest (top {nnear} at full d)
          </span>
        )}
        <span className="ml-auto italic">radius = jitter (spacing only), not data</span>
      </div>

      {/* sentences: the anchor, plus the hovered/locked point */}
      {anchorText && (
        <div className="mt-2 text-xs text-gray-600 dark:text-gray-300">
          <b style={{ color: 'currentColor' }}>★ your point</b>{' '}
          <span className="italic">“{anchorText}”</span>
        </div>
      )}
      <div className="mt-1 min-h-[1.4em] text-xs text-gray-600 dark:text-gray-300">
        {activeText ? (
          <>
            <span style={{ color: activeColor }}>●</span> <b>{activeLabel}:</b>{' '}
            {activeQuote ? (
              <span className="italic">“{activeText}”</span>
            ) : (
              <span>{activeText}</span>
            )}
            {sel && (
              <button
                onClick={() => setSel(null)}
                className="ml-2 text-gray-400 underline hover:text-gray-600 dark:hover:text-gray-200"
              >
                unlock
              </button>
            )}
          </>
        ) : (
          <span className="text-gray-400">
            Click any dot to lock it and watch its vote as you change d; hover a green dot for its
            sentence.
          </span>
        )}
      </div>

      <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        Every other vector casts a <b>vote</b> on yours — <b>with</b> you toward 0°, <b>against</b>{' '}
        you toward 180°, or <b style={{ color: '#f59e0b' }}>neutralized</b> at 90° (⟂), where its
        coordinate votes cancel. At <span className="font-mono">d = {d}</span>, <b>{randPerp}%</b>{' '}
        of random vectors sit within ±0.1 of neutral.{' '}
        {realCos ? (
          <>
            The <b style={{ color: '#10b981' }}>real jina</b> cloud crowds neutral too —{' '}
            <b>{realPerp}%</b> within ±0.1 of 90° — but unlike random it trails a warm tail of true
            neighbours voting strongly <b>with</b> you (toward 0°). That tail, not the average, is
            the structure, and it barely fades as you truncate the dimension. (Distance from the
            centre is only jitter so the dots don&apos;t overlap — read the angle, not the radius.)
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

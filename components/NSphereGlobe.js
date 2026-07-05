import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

// Same projection for both: high-dim vectors -> UMAP-3D -> unit sphere -> globe. Random
// spreads into a featureless even globe at every dimension; real mxbai breaks into clusters.
// Coordinates are precomputed (UMAP can't run in-browser); the component just renders them.
const DIMS = [64, 128, 256, 512, 1024] // shared: genuine mxbai Matryoshka slices, valid sphere dims
const PAL = ['#60a5fa', '#f59e0b', '#34d399', '#f472b6', '#a78bfa', '#22d3ee', '#fb7185', '#a3e635']
const DATA_URL = '/static/interactives/data/nsphere_globe.json'

export default function NSphereGlobe() {
  const [d, setD] = useState(256)
  const [mode, setMode] = useState('random')
  const [spin, setSpin] = useState(true)
  const [data, setData] = useState(null)
  const canvasRef = useRef(null)
  const spinRef = useRef(spin)
  spinRef.current = spin

  useEffect(() => {
    let ok = true
    fetch(DATA_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => ok && setData(j))
      .catch(() => {})
    return () => {
      ok = false
    }
  }, [])

  const scene = useMemo(() => {
    if (!data) return null
    const P = (data[mode] && data[mode][String(d)]) || []
    const lab = (mode === 'real' ? data.labels : data.random_labels) || []
    return P.map((p, i) => ({ p, c: PAL[(lab[i] ?? 0) % PAL.length] }))
  }, [data, mode, d])

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    const tilt = (24 * Math.PI) / 180
    const ca = Math.cos(tilt),
      sa = Math.sin(tilt)
    let t = 0
    let raf

    function proj(p, R, cx, cy) {
      const c = Math.cos(t),
        s = Math.sin(t)
      const px = p[0] * c + p[2] * s
      const pz = -p[0] * s + p[2] * c
      const py = p[1]
      const Y = py * ca - pz * sa
      const Z = py * sa + pz * ca
      return { x: cx + R * px, y: cy - R * Y, depth: Z }
    }
    function latLonPt(lat, lon) {
      const cl = Math.cos(lat)
      return [cl * Math.cos(lon), Math.sin(lat), cl * Math.sin(lon)]
    }

    function draw() {
      const W = cv.clientWidth || 600
      const H = 380
      if (cv.width !== W) cv.width = W
      if (cv.height !== H) cv.height = H
      ctx.clearRect(0, 0, W, H)
      const cx = W / 2,
        cy = H / 2,
        R = Math.min(W, H) / 2 - 26

      ctx.beginPath()
      ctx.arc(cx, cy, R, 0, 7)
      ctx.fillStyle = 'rgba(125,150,190,0.06)'
      ctx.fill()

      const stroke = (arr, front) => {
        ctx.strokeStyle = front ? 'rgba(148,163,184,0.4)' : 'rgba(148,163,184,0.13)'
        ctx.lineWidth = 1
        ctx.beginPath()
        arr.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
        ctx.stroke()
      }
      for (let m = 0; m < 6; m++) {
        const lon = (m * Math.PI) / 6
        const fr = [],
          bk = []
        for (let a = -90; a <= 90; a += 6) {
          const p = proj(latLonPt((a * Math.PI) / 180, lon), R, cx, cy)
          ;(p.depth >= 0 ? fr : bk).push(p)
        }
        stroke(bk, false)
        stroke(fr, true)
      }
      for (let L = -60; L <= 60; L += 30) {
        const fr = [],
          bk = []
        for (let a = 0; a <= 360; a += 6) {
          const p = proj(latLonPt((L * Math.PI) / 180, (a * Math.PI) / 180), R, cx, cy)
          ;(p.depth >= 0 ? fr : bk).push(p)
        }
        stroke(bk, false)
        stroke(fr, true)
      }

      const pts = scene || []
      const drawn = pts.map((s) => ({ ...proj(s.p, R, cx, cy), c: s.c }))
      drawn.sort((a, b) => a.depth - b.depth)
      for (const p of drawn) {
        ctx.globalAlpha = p.depth >= 0 ? 0.85 : 0.25
        ctx.fillStyle = p.c
        ctx.beginPath()
        ctx.arc(p.x, p.y, 2.2, 0, 7)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      if (spinRef.current) t += 0.004
      raf = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(raf)
  }, [scene])

  return (
    <div className="my-6 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-gray-500 dark:text-gray-400">
          {mode === 'real' ? 'MRL slice' : 'sphere'} d =
        </span>
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
        <span className="ml-auto inline-flex overflow-hidden rounded border border-gray-300 dark:border-gray-600">
          {['random', 'real'].map((mm) => (
            <button
              key={mm}
              onClick={() => setMode(mm)}
              className={`px-2.5 py-1 text-xs transition ${
                mode === mm
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {mm === 'random' ? 'random' : 'real embeddings'}
            </button>
          ))}
        </span>
        <button
          onClick={() => setSpin((s) => !s)}
          className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {spin ? '❚❚' : '▶'}
        </button>
      </div>

      <canvas ref={canvasRef} style={{ width: '100%', height: 380, display: 'block' }} />

      <div className="mt-2 text-sm text-gray-600 dark:text-gray-300">
        {mode === 'random' ? (
          <>
            Random unit vectors — same pipeline as the real embeddings: projected to the globe
            (UMAP) and coloured by k-means. k-means still hands you 8 "clusters", but they're{' '}
            <b>confetti</b> — arbitrary slices of a structureless cloud, scattered all over with no
            coherent regions, at <em>every</em> dimension. That's what "no structure" looks like:
            nothing for search to grab onto.
          </>
        ) : data ? (
          <>
            Real <span className="font-mono">mxbai</span> embeddings — same projection and the same
            k-means as the random case — truncated to their <span className="font-mono">{d}</span>
            -dim Matryoshka slice. Here the clusters are real: they form distinct <b>
              continents
            </b>{' '}
            that hold together as you cut dimensions, which is why{' '}
            <Link href="/blog/mrl-cliff" className="text-blue-500">
              Matryoshka
            </Link>{' '}
            embeddings work. That structure is the whole difference.
          </>
        ) : (
          <>Loading…</>
        )}
      </div>
    </div>
  )
}

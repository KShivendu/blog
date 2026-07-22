import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

// The payoff viz. Same server, same ~380 rps of real work, measured two ways.
// Closed-loop self-limits, so the p99 it REPORTS is small. Open-loop fires on a
// fixed clock and measures from the intended send time, so it captures the true
// tail. The bars are drawn on a log axis (the honest way to show a 40x gap) and
// grow in when scrolled into view. Real numbers from latency-throughput.json.
//
// Hand-built inline SVG, theme-aware, honours prefers-reduced-motion.

const DATA_URL = '/static/data/latency-throughput.json'

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3)
}

export default function CoordinatedOmission() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'

  const [data, setData] = useState(null)
  const [anim, setAnim] = useState(0) // 0..1 draw-in progress
  const [reduced, setReduced] = useState(false)
  const [cw, setCw] = useState(0)
  const containerRef = useRef(null)
  const rafRef = useRef(null)
  const compact = cw > 0 && cw < 520

  const C = dark
    ? {
        ink: '#dde6e0',
        muted: '#8a968e',
        grid: '#141922',
        axis: '#38473e',
        border: '#1e2822',
        card: '#0d1310',
        closed: '#34d399',
        closedFill: 'rgba(52,211,153,0.9)',
        open: '#f87171',
        openFill: 'rgba(248,113,113,0.9)',
        hidden: 'rgba(248,113,113,0.14)',
      }
    : {
        ink: '#14161a',
        muted: '#5f6570',
        grid: '#eef1f6',
        axis: '#c8cfc9',
        border: '#e0e4e1',
        card: '#ffffff',
        closed: '#047857',
        closedFill: '#047857',
        open: '#dc2626',
        openFill: '#dc2626',
        hidden: 'rgba(220,38,38,0.10)',
      }
  const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'

  useEffect(() => {
    let live = true
    fetch(DATA_URL)
      .then((r) => r.json())
      .then((j) => live && setData(j))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver((e) => {
      const w = e[0]?.contentRect?.width
      if (w) setCw(w)
    })
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  // Draw-in when scrolled into view (or immediately if reduced motion).
  const runAnim = () => {
    cancelAnimationFrame(rafRef.current)
    if (reduced) {
      setAnim(1)
      return
    }
    const dur = 1100
    const t0 = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur)
      setAnim(easeOutCubic(p))
      if (p < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
  }

  useEffect(() => {
    const node = containerRef.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      runAnim()
      return
    }
    let fired = false
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !fired) {
          fired = true
          runAnim()
        }
      },
      { threshold: 0.4 }
    )
    obs.observe(node)
    return () => {
      obs.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, data])

  if (!data || !data.coordinated_omission) {
    return <div ref={containerRef} style={{ minHeight: 240, margin: '1.5rem 0' }} />
  }

  const co = data.coordinated_omission
  const closedP99 = co.closed.p99
  const openP99 = co.open.p99_true
  const closedThru = co.closed.throughput
  const openThru = co.open.achieved
  const gap = openP99 / closedP99

  // ── log axis geometry ──
  const W = compact ? 360 : 680
  const H = compact ? 230 : 250
  const m = { t: 34, r: compact ? 18 : 28, b: 46, l: compact ? 96 : 150 }
  const pw = W - m.l - m.r
  const AX_MIN = 10
  const AX_MAX = 5000
  const xlog = (v) =>
    m.l +
    ((Math.log10(Math.max(AX_MIN, v)) - Math.log10(AX_MIN)) /
      (Math.log10(AX_MAX) - Math.log10(AX_MIN))) *
      pw
  const ticks = [10, 30, 100, 300, 1000, 3000]

  const rowH = 34
  const rowY = (i) => m.t + 20 + i * (rowH + 30)
  const barTo = (target, i) => {
    // grow left→right on the log axis
    const full = xlog(target)
    return m.l + (full - m.l) * anim
  }

  const bar = (i, label, value, thru, color, fill, isOpen) => {
    const y = rowY(i)
    const x1 = barTo(value, i)
    return (
      <g key={label}>
        <text
          x={m.l - 10}
          y={y + rowH / 2 - 4}
          textAnchor="end"
          fontSize={compact ? 9.5 : 11}
          fontWeight="700"
          fill={color}
          fontFamily={MONO}
        >
          {label}
        </text>
        <text
          x={m.l - 10}
          y={y + rowH / 2 + 10}
          textAnchor="end"
          fontSize={compact ? 8 : 9}
          fill={C.muted}
          fontFamily={MONO}
        >
          {thru.toFixed(0)} rps served
        </text>
        <rect
          x={m.l}
          y={y}
          width={Math.max(0, x1 - m.l)}
          height={rowH}
          rx={3}
          fill={fill}
          opacity={isOpen ? 0.9 : 0.92}
        />
        <text
          x={x1 + 8}
          y={y + rowH / 2 + 4}
          fontSize={compact ? 11 : 13}
          fontWeight="700"
          fill={color}
          fontFamily={MONO}
          opacity={anim}
        >
          {value >= 1000 ? (value / 1000).toFixed(2) + ' s' : value.toFixed(0) + ' ms'}
        </text>
      </g>
    )
  }

  const yTop = rowY(0)
  const yBot = rowY(1) + rowH
  const gapX = Math.min(barTo(closedP99, 0), barTo(openP99, 1))

  return (
    <div
      ref={containerRef}
      style={{
        margin: '1.5rem 0',
        border: `1px solid ${C.border}`,
        borderRadius: 2,
        background: C.card,
        padding: '12px 12px 8px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 4,
          fontFamily: MONO,
        }}
      >
        <span style={{ fontSize: compact ? 11 : 13, fontWeight: 700, color: C.ink }}>
          Same server, ~{Math.round((closedThru + openThru) / 2)} rps of real work — reported vs
          true p99
        </span>
        <button
          type="button"
          onClick={runAnim}
          style={{
            appearance: 'none',
            cursor: 'pointer',
            fontSize: compact ? 10 : 11,
            padding: '4px 9px',
            border: `1px solid ${C.border}`,
            background: 'transparent',
            color: C.muted,
            fontFamily: MONO,
          }}
        >
          ↻ replay
        </button>
      </div>

      <div style={{ overflowX: compact ? 'auto' : 'visible' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: compact ? `${W}px` : '100%', display: 'block', fontFamily: MONO }}
          aria-label={`Closed-loop reports a p99 of ${closedP99.toFixed(
            0
          )} ms while the true p99 measured open-loop is ${openP99.toFixed(0)} ms, a ${gap.toFixed(
            0
          )} times gap.`}
        >
          <rect width={W} height={H} fill={C.card} />
          {/* gridlines + ticks (log) */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={xlog(t)} y1={m.t} x2={xlog(t)} y2={H - m.b} stroke={C.grid} />
              <text
                x={xlog(t)}
                y={H - m.b + 15}
                textAnchor="middle"
                fontSize={compact ? 8.5 : 9.5}
                fill={C.muted}
                fontFamily={MONO}
              >
                {t >= 1000 ? t / 1000 + 's' : t + 'ms'}
              </text>
            </g>
          ))}
          <text
            x={m.l + pw / 2}
            y={H - 6}
            textAnchor="middle"
            fontSize={compact ? 9 : 10.5}
            fill={C.ink}
            fontFamily={MONO}
          >
            p99 latency (log scale)
          </text>

          {/* "hidden tail" band between the two bars' ends */}
          <rect
            x={gapX}
            y={yTop}
            width={Math.max(0, barTo(openP99, 1) - gapX)}
            height={yBot - yTop}
            fill={C.hidden}
            opacity={anim}
          />

          {bar(0, 'closed-loop', closedP99, closedThru, C.closed, C.closedFill, false)}
          {bar(
            1,
            compact ? 'open (true)' : 'open-loop (true)',
            openP99,
            openThru,
            C.open,
            C.openFill,
            true
          )}

          {/* gap annotation */}
          <text
            x={(gapX + barTo(openP99, 1)) / 2}
            y={rowY(0) - 8}
            textAnchor="middle"
            fontSize={compact ? 10 : 12}
            fontWeight="700"
            fill={C.open}
            fontFamily={MONO}
            opacity={anim}
          >
            {gap.toFixed(0)}× hidden{compact ? '' : ' by coordinated omission'}
          </text>
        </svg>
      </div>

      <div
        style={{
          fontFamily: MONO,
          fontSize: compact ? 8.5 : 9.5,
          color: C.muted,
          marginTop: 2,
          lineHeight: 1.4,
        }}
      >
        Closed-loop ran p={co.closed.p} workers; open-loop fired λ={co.open.lambda}/s (just over the
        ~{data.params.capacity_rps.toFixed(0)} rps capacity). Both cleared ~{openThru.toFixed(0)}{' '}
        rps — but only the open-loop clock measured what the queue did to real arrivals.
      </div>
    </div>
  )
}

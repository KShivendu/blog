import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

// The money viz: two lanes driven by the SAME "offered load" knob so you can
// watch them diverge. TOP = closed-loop (a fixed pool of p request tokens that
// circulate dispatch -> queue -> service -> re-dispatch; at most p in the
// system, ever). BOTTOM = open-loop (tokens injected on a fixed clock at rate
// λ; when λ outpaces the N service slots they pile into a visibly unbounded
// queue). One server model (N slots, one service time) feeds both, so the only
// difference on screen is the load model itself.
//
// Hand-built: requestAnimationFrame + inline SVG, theme-aware via the same
// Teletype palette the LineChart/BarChart use, honours prefers-reduced-motion,
// and only animates while scrolled into view.

const N_SLOTS = 4 // server "workers" (semaphore permits)
const SERVICE_S = 1.35 // visual service time per request
const TRAVEL_S = 0.55 // visual dispatch/return travel time
const CAPACITY = N_SLOTS / SERVICE_S // tokens/sec the server can clear

const PRESETS = [
  { key: 'under', label: 'Under capacity', mult: 0.6 },
  { key: 'knee', label: 'At the knee', mult: 1.0 },
  { key: 'over', label: 'Overload', mult: 1.5 },
]

function lerp(a, b, t) {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

let _uid = 0
const nextId = () => ++_uid

export default function LoadModelAnimated() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'

  const [mult, setMult] = useState(1.0) // λ / capacity  (also drives closed-loop p)
  const [playing, setPlaying] = useState(true)
  const [inView, setInView] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [, setFrame] = useState(0) // re-render trigger; sim state lives in refs

  const containerRef = useRef(null)
  const [cw, setCw] = useState(0)
  const compact = cw > 0 && cw < 560

  // ── theme palette (mirrors LineChart) ──
  const C = dark
    ? {
        ink: '#dde6e0',
        muted: '#8a968e',
        grid: '#141922',
        axis: '#38473e',
        border: '#1e2822',
        card: '#0d1310',
        lane: 'rgba(255,255,255,0.02)',
        closed: '#34d399',
        closedFill: 'rgba(52,211,153,0.16)',
        open: '#fbbf24',
        openFill: 'rgba(251,191,36,0.16)',
        danger: '#f87171',
        slot: 'rgba(255,255,255,0.05)',
      }
    : {
        ink: '#14161a',
        muted: '#5f6570',
        grid: '#eef1f6',
        axis: '#c8cfc9',
        border: '#e0e4e1',
        card: '#ffffff',
        lane: '#fafbfa',
        closed: '#047857',
        closedFill: 'rgba(4,120,87,0.12)',
        open: '#b45309',
        openFill: 'rgba(180,83,9,0.12)',
        danger: '#dc2626',
        slot: '#f0f2f0',
      }
  const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'

  // ── layout ──
  const W = compact ? 360 : 680
  const LANE_H = 150
  const GAP = 26
  const H = LANE_H * 2 + GAP
  const SRC_X = compact ? 30 : 48
  const QUEUE_X = compact ? 92 : 168 // right edge of the queue staging area
  const QUEUE_LEFT = compact ? 60 : 120
  const SLOT_X = compact ? 210 : 430
  const EXIT_X = compact ? 330 : 630
  const laneMidY = (lane) => (lane === 'closed' ? LANE_H / 2 + 34 : LANE_H + GAP + LANE_H / 2 + 34)
  const slotY = (lane, i) => laneMidY(lane) - ((N_SLOTS - 1) / 2) * 22 + i * 22

  // ── derived knobs ──
  const p = Math.max(1, Math.round(mult * N_SLOTS)) // closed-loop concurrency
  const lam = mult * CAPACITY // open-loop arrival rate

  // ── responsive width ──
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

  // ── prefers-reduced-motion ──
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [])

  // ── in-view ──
  useEffect(() => {
    const node = containerRef.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.2 })
    obs.observe(node)
    return () => obs.disconnect()
  }, [])

  // ── simulation state (mutable, in refs so rAF never re-creates it) ──
  // A token: { id, phase, t (0..1 within phase), slot, y0 }
  //   closed phases: dispatch -> queue -> service -> return -> (dispatch)
  //   open   phases: dispatch -> queue -> service -> exit -> (removed)
  const closedRef = useRef(null)
  const openRef = useRef(null)
  const spawnAccRef = useRef(0)
  const overflowRef = useRef(0) // open-loop tokens beyond what we draw

  // (Re)seed the closed-loop pool whenever p changes.
  useEffect(() => {
    const pool = []
    for (let i = 0; i < p; i++) {
      pool.push({ id: nextId(), phase: 'dispatch', t: (i / p) % 1, slot: -1, y0: 0 })
    }
    closedRef.current = { tokens: pool, slots: new Array(N_SLOTS).fill(null) }
  }, [p])

  useEffect(() => {
    if (!openRef.current) {
      openRef.current = { tokens: [], slots: new Array(N_SLOTS).fill(null) }
    }
  }, [])

  const rafRef = useRef(null)
  const lastRef = useRef(null)
  const playingRef = useRef(false)
  const shouldPlay = playing && inView && !reduced
  useEffect(() => {
    playingRef.current = shouldPlay
  }, [shouldPlay])

  useEffect(() => {
    if (!shouldPlay) return
    const step = (ts) => {
      if (!playingRef.current) return
      if (lastRef.current == null) lastRef.current = ts
      let dt = (ts - lastRef.current) / 1000
      lastRef.current = ts
      dt = Math.min(dt, 0.05) // clamp long frames (tab switch)
      advance(dt)
      setFrame((f) => (f + 1) % 1e9)
      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(rafRef.current)
      lastRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlay, mult])

  // Advance both sims by dt seconds.
  function advance(dt) {
    stepClosed(dt)
    stepOpen(dt)
  }

  function pumpSlots(sim, tokens, onDone, dt) {
    // progress in-service tokens
    for (let i = 0; i < N_SLOTS; i++) {
      const tk = sim.slots[i]
      if (!tk) continue
      tk.t += dt / SERVICE_S
      if (tk.t >= 1) {
        tk.t = 0
        sim.slots[i] = null
        onDone(tk)
      }
    }
    // pull queued tokens into any free slot (FIFO)
    for (let i = 0; i < N_SLOTS; i++) {
      if (sim.slots[i]) continue
      const q = tokens.find((tk) => tk.phase === 'queue')
      if (!q) break
      q.phase = 'service'
      q.t = 0
      q.slot = i
      sim.slots[i] = q
    }
  }

  function stepClosed(dt) {
    const sim = closedRef.current
    if (!sim) return
    const { tokens } = sim
    for (const tk of tokens) {
      if (tk.phase === 'dispatch') {
        tk.t += dt / TRAVEL_S
        if (tk.t >= 1) {
          tk.phase = 'queue'
          tk.t = 0
        }
      } else if (tk.phase === 'return') {
        tk.t += dt / TRAVEL_S
        if (tk.t >= 1) {
          tk.phase = 'dispatch'
          tk.t = 0
        }
      }
    }
    pumpSlots(
      sim,
      tokens,
      (tk) => {
        tk.phase = 'return'
        tk.slot = -1
      },
      dt
    )
  }

  function stepOpen(dt) {
    const sim = openRef.current
    if (!sim) return
    const { tokens } = sim
    // spawn on a fixed clock at rate lam (never gated on completions)
    spawnAccRef.current += dt * lam
    while (spawnAccRef.current >= 1) {
      spawnAccRef.current -= 1
      // Cap the number of live token objects we DRAW for perf; anything beyond
      // is tallied in overflowRef and shown as a number, but still "exists".
      if (tokens.length < 90) {
        tokens.push({ id: nextId(), phase: 'dispatch', t: 0, slot: -1, y0: Math.random() })
      } else {
        overflowRef.current += 1
      }
    }
    for (const tk of tokens) {
      if (tk.phase === 'dispatch') {
        tk.t += dt / TRAVEL_S
        if (tk.t >= 1) {
          tk.phase = 'queue'
          tk.t = 0
        }
      } else if (tk.phase === 'exit') {
        tk.t += dt / TRAVEL_S
      }
    }
    pumpSlots(
      sim,
      tokens,
      (tk) => {
        tk.phase = 'exit'
        tk.slot = -1
        tk.t = 0
      },
      dt
    )
    // remove tokens that have exited; if we have queued backlog beyond draw cap,
    // recycle overflow into the draw pool as slots free up so the count is honest
    sim.tokens = tokens.filter((tk) => !(tk.phase === 'exit' && tk.t >= 1))
    if (overflowRef.current > 0 && sim.tokens.length < 90) {
      const room = 90 - sim.tokens.length
      const add = Math.min(room, overflowRef.current)
      overflowRef.current -= add
      for (let i = 0; i < add; i++)
        sim.tokens.push({ id: nextId(), phase: 'queue', t: 0, slot: -1, y0: Math.random() })
    }
  }

  // ── token screen position for a lane ──
  function pos(lane, tk) {
    const midY = laneMidY(lane)
    if (tk.phase === 'dispatch') {
      return { x: lerp(SRC_X, QUEUE_LEFT, tk.t), y: midY }
    }
    if (tk.phase === 'queue') {
      return null // queued tokens are drawn as a stack separately
    }
    if (tk.phase === 'service') {
      return { x: SLOT_X, y: slotY(lane, tk.slot) }
    }
    if (tk.phase === 'return') {
      // travel back along the bottom of the lane to the source
      const y = midY + LANE_H / 2 - 12
      return { x: lerp(SLOT_X, SRC_X, tk.t), y }
    }
    if (tk.phase === 'exit') {
      return { x: lerp(SLOT_X, EXIT_X + 20, tk.t), y: laneMidY(lane) }
    }
    return { x: SRC_X, y: midY }
  }

  // Queue stacks (drawn tokens waiting for a slot).
  const closedQueue = (closedRef.current?.tokens || []).filter((tk) => tk.phase === 'queue')
  const openQueue = (openRef.current?.tokens || []).filter((tk) => tk.phase === 'queue')
  const openQueueCount = openQueue.length + overflowRef.current
  const closedInFlight = (closedRef.current?.tokens || []).length
  const openInSystem =
    (openRef.current?.tokens || []).filter((tk) => tk.phase !== 'exit').length + overflowRef.current

  // Draw a queue stack at the queue zone; overflow past `maxDrawn` rows shows as
  // a compressed column so the growth stays legible on screen.
  function renderQueue(lane, queue, color, fill) {
    const midY = laneMidY(lane)
    const cols = compact ? 3 : 6
    const rowH = 15
    const maxRows = 5
    const dots = []
    queue.forEach((tk, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      if (row >= maxRows) return
      const x = QUEUE_X - col * 15
      const y = midY - ((maxRows - 1) / 2) * rowH + row * rowH
      dots.push(
        <circle
          key={'q' + tk.id}
          cx={x}
          cy={y}
          r={5}
          fill={fill}
          stroke={color}
          strokeWidth={1.3}
        />
      )
    })
    return dots
  }

  const laneLabel = (lane, title, sub, color) => {
    const y = lane === 'closed' ? 20 : LANE_H + GAP + 20
    return (
      <>
        <text
          x={12}
          y={y}
          fontSize={compact ? 11 : 12.5}
          fontWeight="700"
          fill={color}
          fontFamily={MONO}
        >
          {title}
        </text>
        <text x={12} y={y + 15} fontSize={compact ? 8.5 : 9.5} fill={C.muted} fontFamily={MONO}>
          {sub}
        </text>
      </>
    )
  }

  const renderLane = (lane, sim, color, fill) => {
    if (!sim) return null
    const midY = laneMidY(lane)
    const tokens = sim.tokens
    return (
      <g>
        {/* N service slots */}
        {new Array(N_SLOTS).fill(0).map((_, i) => (
          <rect
            key={'slot' + lane + i}
            x={SLOT_X - 9}
            y={slotY(lane, i) - 9}
            width={18}
            height={18}
            rx={3}
            fill={C.slot}
            stroke={C.axis}
            strokeWidth={1}
          />
        ))}
        <text
          x={SLOT_X}
          y={slotY(lane, N_SLOTS - 1) + 26}
          textAnchor="middle"
          fontSize={compact ? 8 : 9}
          fill={C.muted}
          fontFamily={MONO}
        >
          {N_SLOTS} slots
        </text>
        {/* source marker */}
        <circle
          cx={SRC_X}
          cy={midY}
          r={compact ? 8 : 10}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
        />
        <text
          x={SRC_X}
          y={midY + (compact ? 20 : 24)}
          textAnchor="middle"
          fontSize={compact ? 7.5 : 8.5}
          fill={C.muted}
          fontFamily={MONO}
        >
          {lane === 'closed' ? 'pool' : 'clock'}
        </text>
        {/* queue stack */}
        {renderQueue(lane, lane === 'closed' ? closedQueue : openQueue, color, fill)}
        {/* moving tokens */}
        {tokens.map((tk) => {
          const pt = pos(lane, tk)
          if (!pt) return null
          const inService = tk.phase === 'service'
          return (
            <circle
              key={tk.id}
              cx={pt.x}
              cy={pt.y}
              r={inService ? 6.5 : 5}
              fill={fill}
              stroke={color}
              strokeWidth={inService ? 1.8 : 1.3}
              opacity={tk.phase === 'exit' ? Math.max(0, 1 - tk.t) : 1}
            />
          )
        })}
      </g>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        margin: '1.5rem 0',
        border: `1px solid ${C.border}`,
        borderRadius: 2,
        background: C.card,
        padding: '10px 10px 8px',
      }}
    >
      {/* controls */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          fontFamily: MONO,
        }}
      >
        <div style={{ display: 'flex' }}>
          {PRESETS.map((preset, i) => {
            const on = Math.abs(mult - preset.mult) < 0.001
            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => setMult(preset.mult)}
                style={{
                  appearance: 'none',
                  cursor: 'pointer',
                  fontSize: compact ? 10.5 : 11.5,
                  lineHeight: 1,
                  padding: compact ? '6px 8px' : '6px 11px',
                  border: `1px solid ${on ? C.ink : C.border}`,
                  marginLeft: i === 0 ? 0 : '-1px',
                  background: on ? C.ink : 'transparent',
                  color: on ? C.card : C.muted,
                  fontFamily: 'inherit',
                  fontWeight: on ? 600 : 400,
                }}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={() => setPlaying((v) => !v)}
          style={{
            marginLeft: 'auto',
            appearance: 'none',
            cursor: 'pointer',
            fontSize: compact ? 10.5 : 11.5,
            padding: compact ? '6px 8px' : '6px 10px',
            border: `1px solid ${C.border}`,
            background: 'transparent',
            color: C.muted,
            fontFamily: MONO,
            whiteSpace: 'nowrap',
          }}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
      </div>

      {/* offered-load slider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 8,
          fontFamily: MONO,
        }}
      >
        <span style={{ fontSize: compact ? 9.5 : 10.5, color: C.muted, whiteSpace: 'nowrap' }}>
          offered load
        </span>
        <input
          type="range"
          min={20}
          max={180}
          value={Math.round(mult * 100)}
          onChange={(e) => setMult(Number(e.target.value) / 100)}
          style={{ flex: 1, accentColor: C.closed }}
          aria-label="offered load as a fraction of server capacity"
        />
        <span
          style={{
            fontSize: compact ? 10.5 : 12,
            fontWeight: 700,
            color: mult > 1.02 ? C.danger : C.ink,
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {mult.toFixed(2)}× capacity
        </span>
      </div>

      <div style={{ overflowX: compact ? 'auto' : 'visible' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: compact ? `${W}px` : '100%', display: 'block', fontFamily: MONO }}
          aria-label="Closed-loop (top) circulates a fixed pool of requests; open-loop (bottom) injects requests on a clock and its queue grows when the arrival rate exceeds capacity."
        >
          <rect width={W} height={H} fill={C.card} />
          {/* lane backgrounds */}
          <rect x={0} y={0} width={W} height={LANE_H} rx={2} fill={C.lane} />
          <rect x={0} y={LANE_H + GAP} width={W} height={LANE_H} rx={2} fill={C.lane} />

          {laneLabel('closed', 'CLOSED-LOOP', `p = ${p} workers · in-flight capped at p`, C.closed)}
          {laneLabel(
            'open',
            'OPEN-LOOP',
            `λ = ${lam.toFixed(0)}/s · in system: ${openInSystem}${
              mult > 1.02 ? ' ↑ growing' : ''
            }`,
            C.open
          )}

          {renderLane('closed', closedRef.current, C.closed, C.closedFill)}
          {renderLane('open', openRef.current, C.open, C.openFill)}

          {/* in-flight readouts on the right */}
          <text
            x={W - 8}
            y={laneMidY('closed') - 40}
            textAnchor="end"
            fontSize={compact ? 9 : 10}
            fill={C.closed}
            fontFamily={MONO}
            fontWeight="600"
          >
            in-flight = {closedInFlight} (bounded)
          </text>
          <text
            x={W - 8}
            y={laneMidY('open') - 40}
            textAnchor="end"
            fontSize={compact ? 9 : 10}
            fill={mult > 1.02 ? C.danger : C.open}
            fontFamily={MONO}
            fontWeight="600"
          >
            queue = {openQueueCount}
            {mult > 1.02 ? ' (unbounded)' : ''}
          </text>
        </svg>
      </div>

      <div
        style={{
          fontFamily: MONO,
          fontSize: compact ? 8.5 : 9.5,
          color: C.muted,
          marginTop: 4,
          lineHeight: 1.4,
        }}
      >
        {reduced ? (
          <>
            Animation paused (you prefer reduced motion). Drag the slider to compare the two models.
          </>
        ) : mult > 1.02 ? (
          <>
            Above 1.0× the open-loop queue grows without bound — arrivals outrun the{' '}
            {CAPACITY.toFixed(0)}
            /s the {N_SLOTS} slots can clear. The closed-loop pool just waits, so its in-flight
            count never exceeds p.
          </>
        ) : (
          <>
            Below 1.0× both keep up. Push the slider past 1.0× and only the open-loop lane backs up
            — the closed-loop pool is self-limiting.
          </>
        )}
      </div>
    </div>
  )
}

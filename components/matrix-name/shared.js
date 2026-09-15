import { useCallback, useEffect, useRef, useState } from 'react'

/** Glyphs that all exist in the mono face. Ligatures are off in CSS so pairs
 *  like <> and // keep their single-cell width. */
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*?!+=~^<>/|'

export const randomGlyph = () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]

/** Blank that holds its cell, so an erased character costs no width. */
export const BLANK = ' '

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Runs `step(elapsedMs, scratch)` on every animation frame while hovered or
 * focused. `step` returns a frame to render, `undefined` to leave the last
 * frame alone, or `null` when the animation is over. A frame carrying
 * `done: true` stops the loop but stays on screen until the pointer leaves,
 * which is how a variant holds its finished state. `scratch` is a per-run
 * object for mutable state that shouldn't trigger a render.
 *
 * Bumping `trigger` replays without a pointer, which is what the lab page's
 * replay button uses.
 */
const HOLD_MS = 1100 // how long a replay shows its finished frame before letting go

export function useHoverAnimation(step, trigger) {
  const [frame, setFrame] = useState(null)
  const rafRef = useRef(0)
  const holdRef = useRef(0)
  const stepRef = useRef(step)
  stepRef.current = step

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    clearTimeout(holdRef.current)
    rafRef.current = 0
    holdRef.current = 0
    setFrame(null)
  }, [])

  // A hover run holds its finished frame until the pointer leaves. A replay has
  // no pointer to leave, so it releases itself after HOLD_MS instead of sticking.
  const run = useCallback(
    (autoRelease) => {
      if (prefersReducedMotion()) return
      cancelAnimationFrame(rafRef.current)
      clearTimeout(holdRef.current)
      const startedAt = performance.now()
      const scratch = {}
      const tick = (now) => {
        const next = stepRef.current(now - startedAt, scratch)
        if (next === null) {
          rafRef.current = 0
          setFrame(null)
          return
        }
        if (next !== undefined) setFrame(next)
        if (next && next.done) {
          rafRef.current = 0
          if (autoRelease) holdRef.current = setTimeout(() => setFrame(null), HOLD_MS)
          return
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    },
    [setFrame]
  )

  const start = useCallback(() => run(false), [run])

  useEffect(() => stop, [stop])
  useEffect(() => {
    if (trigger) run(true)
  }, [trigger, run])

  return {
    frame,
    handlers: { onMouseEnter: start, onMouseLeave: stop, onFocus: start, onBlur: stop },
  }
}

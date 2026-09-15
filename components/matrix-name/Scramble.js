import MatrixStyles from './styles'
import { randomGlyph, useHoverAnimation } from './shared'

const STEP_MS = 50 // one more character locks every STEP_MS
const ROLL_MS = 40 // unlocked characters pick a new glyph this often

/**
 * Characters settle left to right. Every character already locked keeps the
 * head colour, and the finished name holds on screen until the pointer leaves.
 *
 * No glow on the fixed cells. An accent-coloured shadow behind one leading
 * glyph reads as a bright head; behind a whole settled word it reads as a green
 * outline traced around every letter.
 */
const LockWhiteScramble = ({ text, className = '', trigger }) => {
  const chars = text.split('')

  const { frame, handlers } = useHoverAnimation((elapsed, s) => {
    const head = Math.floor(elapsed / STEP_MS)
    if (head >= chars.length) return { glyphs: chars, head: chars.length, done: true }
    if (s.lastRoll !== undefined && elapsed - s.lastRoll < ROLL_MS) return undefined
    s.lastRoll = elapsed
    return { glyphs: chars.map((c, i) => (i < head ? c : randomGlyph())), head }
  }, trigger)

  const glyphs = frame ? frame.glyphs : chars

  return (
    <>
      <MatrixStyles />
      {/* The header link carries aria-label={text}, so hide the churning
          characters from assistive tech rather than announcing garbage. */}
      <span
        aria-hidden="true"
        className={`matrix-name ${frame ? 'is-scrambling' : ''} ${className}`}
        {...handlers}
      >
        {glyphs.map((glyph, i) => (
          <span key={i} className={frame && i < frame.head ? 'matrix-fixed' : undefined}>
            {glyph}
          </span>
        ))}
      </span>
    </>
  )
}

export default LockWhiteScramble

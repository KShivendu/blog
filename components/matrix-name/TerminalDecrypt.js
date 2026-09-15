import MatrixStyles from './styles'
import { BLANK, randomGlyph, useHoverAnimation } from './shared'

const ERASE_MS = 32 // a block cursor eats one character per ERASE_MS, right to left
const TYPE_MS = 48 // then retypes one character per TYPE_MS, left to right
const ROLL_MS = 36

/**
 * Terminal-style erase and retype. Erased cells render as a non-breaking space
 * so the box keeps its width the whole way through.
 */
const TerminalDecrypt = ({ text, className = '', trigger }) => {
  const chars = text.split('')
  const n = chars.length

  const { frame, handlers } = useHoverAnimation((elapsed, s) => {
    const eraseEnd = n * ERASE_MS

    if (elapsed < eraseEnd) {
      const k = Math.floor(elapsed / ERASE_MS) // characters eaten so far
      if (s.lastK === `e${k}`) return undefined
      s.lastK = `e${k}`
      const cursor = n - 1 - k
      return {
        glyphs: chars.map((c, i) => (i < cursor ? c : BLANK)),
        cursor,
        head: -1,
      }
    }

    const k = Math.floor((elapsed - eraseEnd) / TYPE_MS) // characters retyped
    if (k >= n) return null
    if (s.lastRoll !== undefined && elapsed - s.lastRoll < ROLL_MS) return undefined
    s.lastRoll = elapsed
    return {
      glyphs: chars.map((c, i) => (i < k ? c : i === k ? randomGlyph() : BLANK)),
      cursor: -1,
      head: k,
    }
  }, trigger)

  const glyphs = frame ? frame.glyphs : chars

  return (
    <>
      <MatrixStyles />
      <span
        aria-hidden="true"
        className={`matrix-name ${frame ? 'is-scrambling' : ''} ${className}`}
        {...handlers}
      >
        {glyphs.map((glyph, i) => {
          let cls
          if (frame && i === frame.cursor) cls = 'matrix-block'
          else if (frame && i === frame.head) cls = 'matrix-head'
          return (
            <span key={i} className={cls}>
              {glyph}
            </span>
          )
        })}
      </span>
    </>
  )
}

export default TerminalDecrypt

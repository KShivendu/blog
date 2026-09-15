import LockWhiteScramble from './Scramble'
import TerminalDecrypt from './TerminalDecrypt'

export { LockWhiteScramble, TerminalDecrypt }

/** The two rows at /matrix-lab, default first. */
export const VARIANTS = [
  {
    id: 'terminal',
    title: 'Terminal decrypt',
    blurb: 'A block cursor eats the name right to left, then retypes it.',
    cost: 'ships in the header',
    Component: TerminalDecrypt,
  },
  {
    id: 'lock-white',
    title: 'Cascade, locking white',
    blurb:
      'Characters settle left to right and keep the bright colour once fixed, so the finished name holds white while hovered.',
    cost: 'alternative',
    Component: LockWhiteScramble,
  },
]

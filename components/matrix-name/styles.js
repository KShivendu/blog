/**
 * Every style the two variants need, carried by the components themselves
 * rather than by css/tailwind.css, so the whole feature is `rm -rf`-able.
 * styled-jsx hashes by content, so rendering this from both variants at once
 * still only puts one copy in the document.
 */
const MatrixStyles = () => (
  <style jsx global>{`
    /* Leading glyph of the decode sweep. Measured with scripts/color-check.py:
       vs the accent tail dE 25.3 light / 24.5 dark (floor 15), and 14.73:1 /
       18.34:1 contrast on their surfaces. */
    :root {
      --matrix-head: #022c22;
    }
    .dark {
      --matrix-head: #ecfdf5;
    }

    /* The mono grid keeps the width fixed, but Fira Code would ligate scramble
       pairs like <> and // into one wider glyph, so calt is off throughout. */
    .matrix-name {
      font-variant-ligatures: none;
      font-feature-settings: 'calt' 0;
    }
    .matrix-name.is-scrambling {
      color: var(--tty-accent);
    }

    /* Terminal decrypt: the character being typed, and the block cursor that
       eats the name before it. */
    .matrix-name .matrix-head {
      color: var(--matrix-head);
    }
    .dark .matrix-name .matrix-head {
      text-shadow: 0 0 7px var(--tty-accent);
    }
    .matrix-name .matrix-block {
      background: var(--tty-accent);
    }

    /* Lock-white: characters behind the sweep keep the head colour and the
       finished name holds. No glow. An accent-coloured shadow behind nine white
       glyphs reads as a green outline around every letter, which is fine for one
       leading glyph and wrong for a whole settled word. */
    .matrix-name .matrix-fixed {
      color: var(--matrix-head);
    }
  `}</style>
)

export default MatrixStyles

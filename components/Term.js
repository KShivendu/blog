/* eslint-disable react/display-name */

/*
 * <Term def="explanation">phrase</Term>
 *
 * Inline glossary term: a dashed underline + `help` cursor signals it's
 * explainable; hovering (or tapping / focusing on touch + keyboard) reveals a
 * small theme-aware tooltip with the explanation. CSS-driven (no JS state) via
 * :hover / :focus-within. `title` is accepted as an alias for `def`.
 */
export default function Term({ children, def, title }) {
  const explanation = def || title || ''
  return (
    <span className="tty-term" tabIndex={0} role="note">
      {children}
      <span className="tty-term-pop" role="tooltip">
        {explanation}
      </span>
    </span>
  )
}

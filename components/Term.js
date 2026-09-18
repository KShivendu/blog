/* eslint-disable react/display-name */

/*
 * <Term def="explanation">phrase</Term>
 *
 * Inline glossary term: a dashed underline + `help` cursor signals it's
 * explainable; hovering (or tapping / focusing on touch + keyboard) reveals a
 * small theme-aware tooltip with the explanation. CSS-driven (no JS state) via
 * :hover / :focus-within. `title` is accepted as an alias for `def`.
 */
// The explanation reaches us as one string, since it has to survive a round trip
// back to markdown source in remark-term-link. Markdown never gets to run on it,
// so the small subset worth having is rendered here.
const MARKUP = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g

function render(text) {
  return text.split(MARKUP).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    if (part.startsWith('_') && part.endsWith('_')) return <em key={i}>{part.slice(1, -1)}</em>
    return part
  })
}

export default function Term({ children, def, title }) {
  const explanation = def || title || ''
  return (
    <span className="tty-term" tabIndex={0} role="note">
      {children}
      <span className="tty-term-pop" role="tooltip">
        {render(explanation)}
      </span>
    </span>
  )
}

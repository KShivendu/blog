import { visit } from 'unist-util-visit'

const TERM_PATTERN = /#\[([^\]]+)\]\(([^()]+)\)/g

/*
 * `text #[phrase](explanation) more text` — turns into a <Term def="explanation">
 * glossary tooltip. Not real link syntax (the destination has spaces, which
 * CommonMark disallows without <...>), so it fails to parse as a link and
 * falls back to plain, literal text everywhere else this markdown is rendered.
 */
export default function remarkTermLink() {
  return (tree) => {
    visit(tree, 'text', (node, index, parent) => {
      if (!parent || index == null || !TERM_PATTERN.test(node.value)) return
      TERM_PATTERN.lastIndex = 0

      const parts = []
      let lastEnd = 0
      let match
      while ((match = TERM_PATTERN.exec(node.value))) {
        if (match.index > lastEnd) {
          parts.push({ type: 'text', value: node.value.slice(lastEnd, match.index) })
        }
        parts.push({
          type: 'mdxJsxTextElement',
          name: 'Term',
          attributes: [{ type: 'mdxJsxAttribute', name: 'def', value: match[2] }],
          children: [{ type: 'text', value: match[1] }],
        })
        lastEnd = match.index + match[0].length
      }
      if (lastEnd < node.value.length) {
        parts.push({ type: 'text', value: node.value.slice(lastEnd) })
      }

      parent.children.splice(index, 1, ...parts)
      return index + parts.length
    })
  }
}

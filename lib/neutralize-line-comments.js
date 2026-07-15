/**
 * MDX has no syntax for JS-style `//` line comments in "flow" context. A bare
 * `//` line between top-level blocks (e.g. right before an `export const …`)
 * makes xdm/acorn fail with "Unexpected content after expression". This rewrites
 * full-line `//` comments to MDX brace-slash-star comment nodes so authors can
 * use them.
 *
 * Rules (kept deliberately conservative):
 *  - Skip anything inside a fenced code block (``` or ~~~, incl. custom fences
 *    like ```napkin / ```python). `//` there is real code, preserved verbatim.
 *  - Only neutralize a comment whose `//` sits at column 0 (no leading
 *    whitespace). Indented `//` lines are left untouched on purpose: they are
 *    either markdown indented code or valid JS comments inside `export` blocks /
 *    JSX, all of which already parse fine and must not be rewritten.
 *  - Trailing comments (`const x = 5 // note`) and URLs (`https://…`) never
 *    start a line with `//`, so they are naturally left alone.
 * We rewrite (rather than strip) so the line is preserved as a block boundary,
 * and escape any closing-comment delimiter in the text so it can't terminate the
 * MDX comment early.
 */
function neutralizeLineComments(source) {
  const lines = source.split('\n')
  let inFence = false
  let fenceMarker = null // '`' or '~' — the char that opened the current fence
  for (let i = 0; i < lines.length; i++) {
    const fenceMatch = lines[i].match(/^\s*(```+|~~~+)/)
    if (fenceMatch) {
      const marker = fenceMatch[1][0]
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (marker === fenceMarker) {
        inFence = false
        fenceMarker = null
      }
      continue
    }
    if (inFence) continue
    if (/^\/\//.test(lines[i])) {
      const body = lines[i].replace(/^\/\/\s?/, '').replace(/\*\//g, '* /')
      lines[i] = `{/* ${body} */}`
    }
  }
  return lines.join('\n')
}

module.exports = neutralizeLineComments

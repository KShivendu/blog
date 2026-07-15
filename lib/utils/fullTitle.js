// Reconstruct the complete "Head: Tail" title from split frontmatter.
// Posts store `title` (head) and optional `subtitle` (tail) separately; use
// this wherever the FULL title is needed (listings, SEO, feeds, prev/next).
export const fullTitle = (fm) =>
  fm && fm.subtitle ? `${fm.title}: ${fm.subtitle}` : fm && fm.title

export default fullTitle

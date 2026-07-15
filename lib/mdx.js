import { bundleMDX } from 'mdx-bundler'
import fs from 'fs'
import matter from 'gray-matter'
import path from 'path'
import readingTime from 'reading-time'
import { visit } from 'unist-util-visit'
import getAllFilesRecursively from './utils/files'
// Remark packages
import remarkGfm from 'remark-gfm'
import remarkFootnotes from 'remark-footnotes'
import remarkMath from 'remark-math'
import remarkExtractFrontmatter from './remark-extract-frontmatter'
import remarkCodeTitles from './remark-code-title'
import remarkTocHeadings from './remark-toc-headings'
import remarkImgToJsx from './remark-img-to-jsx'
// Rehype packages
import rehypeSlug from 'rehype-slug'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import rehypeKatex from 'rehype-katex'
import rehypeCitation from 'rehype-citation'
import rehypePrismPlus from 'rehype-prism-plus'
import rehypePresetMinify from 'rehype-preset-minify'

const root = process.cwd()

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

export function getFiles(type) {
  const prefixPaths = path.join(root, 'data', type)
  const files = getAllFilesRecursively(prefixPaths)
  // Only want to return blog/path and ignore root, replace is needed to work on Windows
  return files.map((file) => file.slice(prefixPaths.length + 1).replace(/\\/g, '/'))
}

export function formatSlug(slug) {
  return slug.replace(/\.(mdx|md)/, '')
}

export function dateSortDesc(a, b) {
  if (a > b) return -1
  if (a < b) return 1
  return 0
}

export async function getFileBySlug(type, slug) {
  const mdxPath = path.join(root, 'data', type, `${slug}.mdx`)
  const mdPath = path.join(root, 'data', type, `${slug}.md`)
  const source = fs.existsSync(mdxPath)
    ? fs.readFileSync(mdxPath, 'utf8')
    : fs.readFileSync(mdPath, 'utf8')

  // https://github.com/kentcdodds/mdx-bundler#nextjs-esbuild-enoent
  if (process.platform === 'win32') {
    process.env.ESBUILD_BINARY_PATH = path.join(root, 'node_modules', 'esbuild', 'esbuild.exe')
  } else {
    process.env.ESBUILD_BINARY_PATH = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild')
  }

  let toc = []

  // MDX doesn't support HTML comments; convert <!-- --> to {/* */} before parsing
  // and rewrite full-line `//` comments (outside code fences) the same way.
  const htmlCommentsConverted = source.replace(
    /<!--([\s\S]*?)-->/g,
    (_, content) => `{/*${content}*/}`
  )
  const processedSource = neutralizeLineComments(htmlCommentsConverted)

  const { code, frontmatter } = await bundleMDX({
    source: processedSource,
    // mdx imports can be automatically source from the components directory
    cwd: path.join(root, 'components'),
    xdmOptions(options, frontmatter) {
      // this is the recommended way to add custom remark/rehype plugins:
      // The syntax might look weird, but it protects you in case we add/remove
      // plugins in the future.
      options.remarkPlugins = [
        ...(options.remarkPlugins ?? []),
        remarkExtractFrontmatter,
        [remarkTocHeadings, { exportRef: toc }],
        remarkGfm,
        remarkCodeTitles,
        [remarkFootnotes, { inlineNotes: true }],
        remarkMath,
        remarkImgToJsx,
      ]
      options.rehypePlugins = [
        ...(options.rehypePlugins ?? []),
        rehypeSlug,
        rehypeAutolinkHeadings,
        rehypeKatex,
        [rehypeCitation, { path: path.join(root, 'data') }],
        [rehypePrismPlus, { ignoreMissing: true }],
        rehypePresetMinify,
      ]
      return options
    },
    esbuildOptions: (options) => {
      options.loader = {
        ...options.loader,
        '.js': 'jsx',
      }
      return options
    },
  })

  return {
    mdxSource: code,
    toc,
    frontMatter: {
      readingTime: readingTime(code),
      slug: slug || null,
      fileName: fs.existsSync(mdxPath) ? `${slug}.mdx` : `${slug}.md`,
      ...frontmatter,
      date: frontmatter.date ? new Date(frontmatter.date).toISOString() : null,
    },
  }
}

export async function getAllFilesFrontMatter(folder) {
  const prefixPaths = path.join(root, 'data', folder)

  const files = getAllFilesRecursively(prefixPaths)

  const allFrontMatter = []

  files.forEach((file) => {
    // Replace is needed to work on Windows
    const fileName = file.slice(prefixPaths.length + 1).replace(/\\/g, '/')
    // Remove Unexpected File
    if (path.extname(fileName) !== '.md' && path.extname(fileName) !== '.mdx') {
      return
    }
    const source = fs.readFileSync(file, 'utf8')
    const { data: frontmatter } = matter(source)
    if (frontmatter.draft !== true) {
      allFrontMatter.push({
        ...frontmatter,
        slug: formatSlug(fileName),
        date: frontmatter.date ? new Date(frontmatter.date).toISOString() : null,
      })
    }
  })

  return allFrontMatter
    .sort((a, b) => dateSortDesc(a.date, b.date))
    .filter((p) => p.date && p.title && p.tags)
}

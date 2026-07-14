import Link from '@/components/Link'
import { useMemo, useState } from 'react'
import siteMetadata from '@/data/siteMetadata'

// Compact, tabular date for the aligned index column: "Jan 15, 2026".
const formatIndexDate = (date) =>
  new Date(date).toLocaleDateString(siteMetadata.locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })

// ── Fuzzy / typo-tolerant search ────────────────────────────────────────────
// No dependency: substring → Levenshtein-within-budget → prefix-typo, per term.
// Damerau (optimal string alignment) distance — adjacent transpositions cost 1,
// so common typos like "vetcor"→"vector" / "saerch"→"search" are 1 edit.
function levenshtein(a, b) {
  const m = a.length
  const n = b.length
  if (!m) return n
  if (!n) return m
  let prev2 = null
  let prev = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1)
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1)
      }
      cur[j] = v
    }
    prev2 = prev
    prev = cur
  }
  return prev[n]
}

// Typo budget scales with term length (short terms must be near-exact).
const typoBudget = (len) => (len < 4 ? 0 : len < 8 ? 1 : 2)

// Best score for one query term against a field's words + full string.
function termScore(term, words, fieldStr) {
  if (fieldStr.includes(term)) return 3 // exact substring — strongest
  const budget = typoBudget(term.length)
  if (!budget) return 0
  let best = 0
  for (const w of words) {
    if (Math.abs(w.length - term.length) <= budget) {
      const d = levenshtein(term, w)
      if (d <= budget) best = Math.max(best, 2 - d * 0.3) // whole-word typo
    }
    if (w.length > term.length) {
      const dp = levenshtein(term, w.slice(0, term.length))
      if (dp <= budget) best = Math.max(best, 1.5 - dp * 0.3) // prefix typo (still typing)
    }
  }
  return best
}

const wordsOf = (s) => s.split(/[^a-z0-9]+/i).filter(Boolean)

function scorePost(terms, fm) {
  const title = (fm.title || '').toLowerCase()
  const rest = ((fm.summary || '') + ' ' + (fm.tags || []).join(' ')).toLowerCase()
  const titleWords = wordsOf(title)
  const restWords = wordsOf(rest)
  let total = 0
  for (const term of terms) {
    // Title matches count more than summary/tags.
    const s = Math.max(termScore(term, titleWords, title) * 1.6, termScore(term, restWords, rest))
    if (s <= 0) return 0 // every term must match somewhere (AND)
    total += s
  }
  return total
}

export default function ListLayout({ posts, label = 'Blog', meta }) {
  const [searchValue, setSearchValue] = useState('')
  const filteredBlogPosts = useMemo(() => {
    const terms = searchValue.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!terms.length) return posts
    return posts
      .map((fm) => ({ fm, score: scorePost(terms, fm) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.fm)
  }, [posts, searchValue])

  return (
    <div className="mx-auto max-w-[960px] pt-6 pb-10">
      {/* Compact header: a quiet count/summary + search. The framed window
          below carries the section name once, in its notch. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {meta || `${filteredBlogPosts.length} entries`}
        </p>
        <div className="relative w-full sm:w-64">
          <input
            aria-label="Search articles"
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="search"
            className="block w-full border border-gray-300 bg-transparent px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-700 dark:text-gray-100 dark:placeholder:text-gray-500"
          />
          <svg
            className="absolute right-2.5 top-2 h-4 w-4 text-gray-400 dark:text-gray-500"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      <div className="tty-list-frame">
        {label && <span className="tty-frame-path">{label}</span>}
        <div className="tty-index-scroll">
          <ul className="tty-index-list">
            {!filteredBlogPosts.length && (
              <li>
                <div className="tty-index-row text-sm text-gray-500 dark:text-gray-400">
                  <span>No posts found.</span>
                </div>
              </li>
            )}
            {filteredBlogPosts.map((frontMatter) => {
              const { slug, date, title } = frontMatter
              return (
                <li key={slug}>
                  <Link href={`/blog/${slug}`} className="tty-index-row" title={title}>
                    <span className="tty-index-title">
                      <span className="tty-index-label">{title}</span>
                    </span>
                    <time className="tty-index-date" dateTime={date}>
                      {formatIndexDate(date)}
                    </time>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}

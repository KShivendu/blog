import Link from '@/components/Link'
import { useState } from 'react'
import siteMetadata from '@/data/siteMetadata'

// Compact, tabular date for the aligned index column: "Jan 15, 2026".
const formatIndexDate = (date) =>
  new Date(date).toLocaleDateString(siteMetadata.locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })

export default function ListLayout({ posts, label = 'Blog', meta }) {
  const [searchValue, setSearchValue] = useState('')
  const filteredBlogPosts = posts.filter((frontMatter) => {
    const searchContent = frontMatter.title + frontMatter.summary + frontMatter.tags.join(' ')
    return searchContent.toLowerCase().includes(searchValue.toLowerCase())
  })

  return (
    <div className="mx-auto max-w-[960px] pt-6 pb-10">
      {/* Compact header: a quiet count/summary + search. The framed window
          below carries the section name once, in its notch. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <span className="text-gray-400 dark:text-gray-500">{'// '}</span>
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

import Link from '@/components/Link'
import Tag from '@/components/Tag'
import siteMetadata from '@/data/siteMetadata'
import { useState } from 'react'
import Pagination from '@/components/Pagination'
import formatDate from '@/lib/utils/formatDate'

export default function ListLayout({
  posts,
  title,
  path = '~/blog',
  initialDisplayPosts = [],
  pagination,
  description,
}) {
  const [searchValue, setSearchValue] = useState('')
  const filteredBlogPosts = posts.filter((frontMatter) => {
    const searchContent = frontMatter.title + frontMatter.summary + frontMatter.tags.join(' ')
    return searchContent.toLowerCase().includes(searchValue.toLowerCase())
  })

  // If initialDisplayPosts exist, display it if no searchValue is specified
  const displayPosts =
    initialDisplayPosts.length > 0 && !searchValue ? initialDisplayPosts : filteredBlogPosts

  return (
    <>
      <div>
        <div className="space-y-4 pt-6 pb-8">
          <div className="tty-buffer">
            <h1 className="tty-path text-2xl font-semibold tracking-tight sm:text-3xl">{path}</h1>
            <span className="tty-cursor" aria-hidden="true" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <span className="text-gray-400 dark:text-gray-500">{'// '}</span>
            {title}
            {description ? ` — ${description}` : ` — ${posts.length} entries`}
          </p>
          <div className="relative max-w-lg">
            <input
              aria-label="Search articles"
              type="text"
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search articles"
              className="block w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-primary-500 focus:ring-primary-500 dark:border-gray-900 dark:bg-gray-800 dark:text-gray-100"
            />
            <svg
              className="absolute right-3 top-3 h-5 w-5 text-gray-400 dark:text-gray-300"
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
        <ul className="mt-6">
          {!filteredBlogPosts.length && (
            <li className="py-4 text-sm text-gray-500 dark:text-gray-400">
              <span className="tty-marker">{'~ '}</span>No posts found.
            </li>
          )}
          {displayPosts.map((frontMatter) => {
            const { slug, date, title, summary } = frontMatter
            return (
              <li key={slug} className="tty-row py-4">
                <article className="space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="tty-marker shrink-0" aria-hidden="true">
                      {'~/'}
                    </span>
                    <h3 className="text-lg font-semibold leading-7 tracking-tight sm:text-xl">
                      <Link href={`/blog/${slug}`} className="text-gray-900 dark:text-gray-100">
                        {title}
                      </Link>
                    </h3>
                  </div>
                  <div className="prose max-w-none pl-6 text-sm text-gray-500 dark:text-gray-400">
                    {summary}
                  </div>
                  <dl className="pl-6">
                    <dt className="sr-only">Published on</dt>
                    <dd className="text-xs font-medium leading-6 text-gray-500 dark:text-gray-400">
                      <span className="text-gray-400 dark:text-gray-500">{'$ date '}</span>
                      <time dateTime={date}>{formatDate(date)}</time>
                    </dd>
                  </dl>
                </article>
              </li>
            )
          })}
        </ul>
      </div>
      {pagination && pagination.totalPages > 1 && !searchValue && (
        <Pagination currentPage={pagination.currentPage} totalPages={pagination.totalPages} />
      )}
    </>
  )
}

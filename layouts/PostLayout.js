import Link from '@/components/Link'
import PageTitle from '@/components/PageTitle'
import SectionContainer from '@/components/SectionContainer'
import { BlogSEO } from '@/components/SEO'
import Image from '@/components/Image'
import Tag from '@/components/Tag'
import siteMetadata from '@/data/siteMetadata'
import Comments from '@/components/comments'
import ScrollTopAndComment from '@/components/ScrollTopAndComment'
import HeadingLinks from '@/components/HeadingLinks'
import { fullTitle } from '@/lib/utils/fullTitle'

const editUrl = (fileName) => `${siteMetadata.siteRepo}/blob/main/data/blog/${fileName}`
const discussUrl = (slug) =>
  `https://x.com/search?q=${encodeURIComponent(`${siteMetadata.siteUrl}/blog/${slug}`)}`

const isoDate = (date) => new Date(date).toISOString().slice(0, 10)

export default function PostLayout({ frontMatter, authorDetails, next, prev, children }) {
  const { slug, fileName, date, title, subtitle, readingTime } = frontMatter

  return (
    <SectionContainer>
      <BlogSEO
        url={`${siteMetadata.siteUrl}/blog/${slug}`}
        authorDetails={authorDetails}
        {...frontMatter}
      />
      <ScrollTopAndComment />
      <article>
        <div className="pt-6">
          <div className="tty-frame tty-article">
            <span className="tty-frame-path" aria-hidden="true">
              {slug}.md
            </span>
            <header className="tty-article-head">
              <dl>
                <dt className="sr-only">Published on</dt>
                <dd className="tty-meta">
                  <time dateTime={date}>{isoDate(date)}</time>
                  {readingTime?.text && (
                    <>
                      <span className="sep" aria-hidden="true">
                        ·
                      </span>
                      <span>{readingTime.text}</span>
                    </>
                  )}
                  <span className="sep" aria-hidden="true">
                    ·
                  </span>
                  <Link href={discussUrl(slug)} rel="nofollow">
                    discuss
                  </Link>
                </dd>
              </dl>
              <div className="pt-1">
                <PageTitle>{title}</PageTitle>
                {subtitle && <p className="tty-subtitle">{subtitle}</p>}
              </div>
            </header>
            <div className="prose-tty prose max-w-none pt-8 pb-2 dark:prose-dark">{children}</div>
            <HeadingLinks />
          </div>
          <div className="tty-article divide-y divide-gray-200 pb-8 dark:divide-gray-700">
            <div className="pt-6 pb-6 text-sm text-gray-700 dark:text-gray-300">
              <Link href={discussUrl(slug)} rel="nofollow">
                {'Discuss on Twitter'}
              </Link>
              {` • `}
              <Link href={editUrl(fileName)}>{'View on GitHub'}</Link>
            </div>
            <Comments frontMatter={frontMatter} />
          </div>
          <div className="tty-article pt-4 pb-2">
            <Link
              href="/blog"
              className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
            >
              &larr; Back to the blog
            </Link>
          </div>
          {(next || prev) && (
            <div className="tty-article flex justify-between border-t border-gray-200 py-8 text-sm font-medium dark:border-gray-700">
              {prev ? (
                <div>
                  <h2 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Previous Article
                  </h2>
                  <div className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
                    <Link href={`/blog/${prev.slug}`}>{fullTitle(prev)}</Link>
                  </div>
                </div>
              ) : (
                <div />
              )}
              {next && (
                <div className="text-right">
                  <h2 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Next Article
                  </h2>
                  <div className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
                    <Link href={`/blog/${next.slug}`}>{fullTitle(next)}</Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </article>
    </SectionContainer>
  )
}

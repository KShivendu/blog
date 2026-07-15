import Link from '@/components/Link'
import PageTitle from '@/components/PageTitle'
import SectionContainer from '@/components/SectionContainer'
import { BlogSEO } from '@/components/SEO'
import siteMetadata from '@/data/siteMetadata'
import Comments from '@/components/comments'
import ScrollTopAndComment from '@/components/ScrollTopAndComment'
import HeadingLinks from '@/components/HeadingLinks'
import { fullTitle } from '@/lib/utils/fullTitle'

const isoDate = (date) => new Date(date).toISOString().slice(0, 10)

export default function PostLayout({ frontMatter, authorDetails, next, prev, children }) {
  const { date, title, subtitle, readingTime } = frontMatter

  return (
    <SectionContainer>
      <BlogSEO url={`${siteMetadata.siteUrl}/blog/${frontMatter.slug}`} {...frontMatter} />
      <ScrollTopAndComment />
      <article>
        <div className="pt-6">
          <div className="tty-frame tty-article">
            <span className="tty-frame-path" aria-hidden="true">
              {frontMatter.slug}.md
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
          <div
            className="tty-article divide-y divide-gray-200 pb-8 dark:divide-gray-700 xl:divide-y-0 "
            style={{ gridTemplateRows: 'auto 1fr' }}
          >
            <Comments frontMatter={frontMatter} />
            <footer>
              <div className="flex flex-col text-sm font-medium sm:flex-row sm:justify-between sm:text-base">
                {prev && (
                  <div className="pt-4 xl:pt-8">
                    <Link
                      href={`/blog/${prev.slug}`}
                      className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      &larr; {fullTitle(prev)}
                    </Link>
                  </div>
                )}
                {next && (
                  <div className="pt-4 xl:pt-8">
                    <Link
                      href={`/blog/${next.slug}`}
                      className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      {fullTitle(next)} &rarr;
                    </Link>
                  </div>
                )}
              </div>
            </footer>
          </div>
        </div>
      </article>
    </SectionContainer>
  )
}

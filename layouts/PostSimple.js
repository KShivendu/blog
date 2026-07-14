import Link from '@/components/Link'
import PageTitle from '@/components/PageTitle'
import SectionContainer from '@/components/SectionContainer'
import { BlogSEO } from '@/components/SEO'
import siteMetadata from '@/data/siteMetadata'
import formatDate from '@/lib/utils/formatDate'
import Comments from '@/components/comments'
import ScrollTopAndComment from '@/components/ScrollTopAndComment'

export default function PostLayout({ frontMatter, authorDetails, next, prev, children }) {
  const { slug, date, title } = frontMatter

  return (
    <SectionContainer>
      <BlogSEO url={`${siteMetadata.siteUrl}/blog/${frontMatter.slug}`} {...frontMatter} />
      <ScrollTopAndComment />
      <article>
        <div className="pt-6">
          <div className="tty-frame mx-auto max-w-[76ch]">
            <span className="tty-frame-path" aria-hidden="true">
              {`~/blog/${slug}.md`}
            </span>
            <header>
              <div className="space-y-2">
                <dl>
                  <dt className="sr-only">Published on</dt>
                  <dd className="text-xs font-medium leading-6 text-gray-500 dark:text-gray-400">
                    <span className="text-gray-400 dark:text-gray-500">{'$ date · '}</span>
                    <time dateTime={date}>{formatDate(date)}</time>
                  </dd>
                </dl>
                <div>
                  <PageTitle>{title}</PageTitle>
                </div>
              </div>
            </header>
            <div className="prose max-w-none pt-8 pb-2 dark:prose-dark">{children}</div>
          </div>
          <div
            className="divide-y divide-gray-200 pb-8 dark:divide-gray-700 xl:divide-y-0 "
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
                      &larr; {prev.title}
                    </Link>
                  </div>
                )}
                {next && (
                  <div className="pt-4 xl:pt-8">
                    <Link
                      href={`/blog/${next.slug}`}
                      className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
                    >
                      {next.title} &rarr;
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

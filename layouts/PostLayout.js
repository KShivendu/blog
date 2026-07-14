import Link from '@/components/Link'
import PageTitle from '@/components/PageTitle'
import SectionContainer from '@/components/SectionContainer'
import { BlogSEO } from '@/components/SEO'
import Image from '@/components/Image'
import Tag from '@/components/Tag'
import siteMetadata from '@/data/siteMetadata'
import Comments from '@/components/comments'
import ScrollTopAndComment from '@/components/ScrollTopAndComment'

const editUrl = (fileName) => `${siteMetadata.siteRepo}/blob/master/data/blog/${fileName}`
const discussUrl = (slug) =>
  `https://mobile.twitter.com/search?q=${encodeURIComponent(
    `${siteMetadata.siteUrl}/blog/${slug}`
  )}`

const postDateTemplate = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }

export default function PostLayout({ frontMatter, authorDetails, next, prev, children }) {
  const { slug, fileName, date, title, tags } = frontMatter

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
          <div className="tty-frame mx-auto max-w-none">
            <header>
              <div className="space-y-2">
                <dl>
                  <dt className="sr-only">Published on</dt>
                  <dd className="text-xs font-medium leading-6 text-gray-500 dark:text-gray-400">
                    <span className="text-gray-400 dark:text-gray-500">{'$ date · '}</span>
                    <time dateTime={date}>
                      {new Date(date).toLocaleDateString(siteMetadata.locale, postDateTemplate)}
                    </time>
                  </dd>
                </dl>
                <div>
                  <PageTitle>{title}</PageTitle>
                </div>
              </div>
            </header>
            <div className="prose max-w-none pt-8 pb-2 dark:prose-dark">{children}</div>
          </div>
          <div className="divide-y divide-gray-200 pb-8 dark:divide-gray-700">
            <div className="pt-6 pb-6 text-sm text-gray-700 dark:text-gray-300">
              <Link href={discussUrl(slug)} rel="nofollow">
                {'Discuss on Twitter'}
              </Link>
              {` • `}
              <Link href={editUrl(fileName)}>{'View on GitHub'}</Link>
            </div>
            <Comments frontMatter={frontMatter} />
          </div>
          <div className="pt-4 pb-2">
            <Link
              href="/blog"
              className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400"
            >
              &larr; Back to the blog
            </Link>
          </div>
          {(next || prev) && (
            <div className="flex justify-between border-t border-gray-200 py-8 text-sm font-medium dark:border-gray-700">
              {prev ? (
                <div>
                  <h2 className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Previous Article
                  </h2>
                  <div className="text-primary-500 hover:text-primary-600 dark:hover:text-primary-400">
                    <Link href={`/blog/${prev.slug}`}>{prev.title}</Link>
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
                    <Link href={`/blog/${next.slug}`}>{next.title}</Link>
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

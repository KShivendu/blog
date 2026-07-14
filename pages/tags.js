import Link from '@/components/Link'
import { PageSEO } from '@/components/SEO'
import Tag from '@/components/Tag'
import siteMetadata from '@/data/siteMetadata'
import { getAllTags } from '@/lib/tags'
import kebabCase from '@/lib/utils/kebabCase'

export async function getStaticProps() {
  const tags = await getAllTags('blog')

  return { props: { tags } }
}

export default function Tags({ tags }) {
  const sortedTags = Object.keys(tags).sort((a, b) => tags[b] - tags[a])
  return (
    <>
      <PageSEO title={`Tags - ${siteMetadata.author}`} description="Things I blog about" />
      <div className="mx-auto max-w-[960px] pt-6 pb-10">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          <span className="text-gray-400 dark:text-gray-500">{'// '}</span>
          Things I blog about · {Object.keys(tags).length} tags
        </p>
        <div className="tty-list-frame">
          <span className="tty-frame-path">Tags</span>
          <div className="flex flex-wrap gap-y-3 p-5 sm:p-6">
            {Object.keys(tags).length === 0 && (
              <span className="text-sm text-gray-500 dark:text-gray-400">No tags found.</span>
            )}
            {sortedTags.map((t) => {
              return (
                <div key={t} className="mr-5 mb-1 flex items-baseline">
                  <Tag text={t} />
                  <Link
                    href={`/tags/${kebabCase(t)}`}
                    className="-ml-1 text-xs font-medium text-gray-500 dark:text-gray-400"
                  >
                    {tags[t]}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

import siteMetadata from '@/data/siteMetadata'
import { PageSEO } from '@/components/SEO'

// Interactive experiments. Each one is served from a Cloudflare Worker through the
// /lab/* rewrites in next.config.js, so plain <a> tags (full page loads) are used here:
// these paths are not Next.js pages and client-side routing can't reach them.
const experiments = [
  {
    title: 'HNSW traversal on the globe',
    href: '/lab/hnsw',
    about:
      'Watch an HNSW search hop across 8,000 world cities, layer by layer, by lat/long or by mxbai embeddings.',
  },
  {
    title: 'IVF clustering on the globe',
    href: '/lab/ivf',
    about:
      'The same cities indexed with IVF: see which clusters a query probes and what it misses.',
  },
  {
    title: 'Query fly-through',
    href: '/lab/flythrough',
    about:
      'Type a scientific claim and watch it land among 5,183 SciFact papers in a 3D embedding space. Hand tracking optional.',
  },
]

export default function Lab() {
  return (
    <>
      <PageSEO
        title={`Lab - ${siteMetadata.author}`}
        description="Interactive experiments by KShivendu: vector search indexes and embedding spaces you can play with."
      />
      <div className="mx-auto max-w-[960px] pt-6 pb-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {experiments.length} experiments
          </p>
        </div>

        <div className="tty-list-frame">
          <span className="tty-frame-path">Lab</span>
          <div className="tty-index-scroll">
            <ul className="tty-index-list">
              {experiments.map((x) => (
                <li key={x.href}>
                  <div className="tty-talk-row">
                    <span className="tty-talk-main">
                      <a href={x.href} className="tty-talk-title" title={x.title}>
                        {x.title}
                      </a>
                      <span className="tty-talk-event">{x.about}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}

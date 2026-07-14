import Link from '@/components/Link'
import siteMetadata from '@/data/siteMetadata'
import { PageSEO } from '@/components/SEO'

// Talks ported from talks.kshivendu.dev. Slide decks stay external: each entry
// links out to its existing slide URL (and video where one exists). Nothing is
// hosted in this repo. Slide URLs live under talks.kshivendu.dev; videos on YouTube.
const talks = [
  {
    title: 'Qdrant: Tiered Multi-tenancy',
    event: 'Qdrant Office Hours (Virtual, Discord)',
    slides: 'https://talks.kshivendu.dev/tiered-multitenancy',
    video: 'https://youtu.be/72Ux-Lgx93w',
  },
  {
    title: 'Qdrant: Internals of a Vector DB',
    event: 'Guest Lecture, DBMS Course, IIT Bhilai',
    slides: 'https://talks.kshivendu.dev/qdrant-db-internals',
  },
  {
    title: 'Beyond filters: Modern search (and more) with vectors in Django',
    event: 'DjangoCon US 2025 (Chicago)',
    slides: 'https://talks.kshivendu.dev/django-vector-search',
    video: 'https://youtu.be/GvEkCBvvA_g',
  },
  {
    title: 'Chaos testing: Breaking a database on purpose',
    event: 'PlatformCon Jun 2025 (Virtual) and FOSS Talks Feb 2025 (PES, Bangalore)',
    slides: 'https://talks.kshivendu.dev/chaos-testing',
    video: 'https://youtu.be/qB5lF4jREUI',
  },
  {
    title: 'Improving search relevance with reranking & fusion',
    event: 'Microsoft Reactor (Bangalore) and Tensorflow May 2024 Meetup (Bangalore)',
    slides: 'https://talks.kshivendu.dev/reranking-fusion',
  },
  {
    title: 'Qdrant: Shaping the future of search and beyond',
    event: 'FOSS United Jan 2024 Meetup (Bangalore)',
    slides: 'https://talks.kshivendu.dev/qdrant',
    video: 'https://youtu.be/dGO_Kxo_x6o',
  },
]

export default function Talks() {
  return (
    <>
      <PageSEO
        title={`Talks - ${siteMetadata.author}`}
        description="Talks and conference sessions by KShivendu on vector search, databases, and Qdrant."
      />
      <div className="mx-auto max-w-[960px] pt-6 pb-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">{talks.length} talks</p>
        </div>

        <div className="tty-list-frame">
          <span className="tty-frame-path">Talks</span>
          <div className="tty-index-scroll">
            <ul className="tty-index-list">
              {talks.map((talk) => {
                const primary = talk.slides || talk.video
                return (
                  <li key={talk.title}>
                    <div className="tty-talk-row">
                      <span className="tty-talk-main">
                        <Link href={primary} className="tty-talk-title" title={talk.title}>
                          {talk.title}
                          <span className="tty-talk-ext" aria-hidden="true">
                            ↗
                          </span>
                        </Link>
                        <span className="tty-talk-event">{talk.event}</span>
                      </span>
                      <span className="tty-talk-links">
                        {talk.video && (
                          <Link href={talk.video} className="tty-talk-link">
                            video
                            <span className="tty-talk-ext" aria-hidden="true">
                              ↗
                            </span>
                          </Link>
                        )}
                        {talk.slides && (
                          <Link href={talk.slides} className="tty-talk-link">
                            slides
                            <span className="tty-talk-ext" aria-hidden="true">
                              ↗
                            </span>
                          </Link>
                        )}
                      </span>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}

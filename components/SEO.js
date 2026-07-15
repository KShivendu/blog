import Head from 'next/head'
import { useRouter } from 'next/router'
import siteMetadata from '@/data/siteMetadata'
import { fullTitle } from '@/lib/utils/fullTitle'

// Absolute URLs for the dynamic OG endpoint (`pages/api/og.js`), which renders
// the social card on the fly and returns a PNG (nothing is stored on disk).
// The default card is used for the homepage / listing / tag pages.
const defaultOgImage = `${siteMetadata.siteUrl}/api/og?type=default`
// A post's card is rendered from its (head) title + optional subtitle. Falls
// back to the default card when no title is available. Both fields are passed
// explicitly; the OG generator no longer splits on a colon at render time.
const postOgImage = (title, subtitle) => {
  if (!title) return defaultOgImage
  const sub = subtitle ? `&subtitle=${encodeURIComponent(subtitle)}` : ''
  return `${siteMetadata.siteUrl}/api/og?title=${encodeURIComponent(title)}${sub}&type=post`
}

const CommonSEO = ({ title, description, ogType, ogImage, twImage, canonicalUrl }) => {
  const router = useRouter()
  return (
    <Head>
      <title>{title}</title>
      <meta name="robots" content="follow, index" />
      <meta name="description" content={description} />
      <meta property="og:url" content={`${siteMetadata.siteUrl}${router.asPath}`} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={siteMetadata.title} />
      <meta property="og:description" content={description} />
      <meta property="og:title" content={title} />
      {ogImage.constructor.name === 'Array' ? (
        ogImage.map(({ url }) => <meta property="og:image" content={url} key={url} />)
      ) : (
        <meta property="og:image" content={ogImage} key={ogImage} />
      )}
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content={siteMetadata.twitter} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={twImage} />
      <link
        rel="canonical"
        href={canonicalUrl ? canonicalUrl : `${siteMetadata.siteUrl}${router.asPath}`}
      />
    </Head>
  )
}

export const PageSEO = ({ title, description }) => {
  const ogImageUrl = defaultOgImage
  const twImageUrl = defaultOgImage
  return (
    <CommonSEO
      title={title}
      description={description}
      ogType="website"
      ogImage={ogImageUrl}
      twImage={twImageUrl}
    />
  )
}

export const TagSEO = ({ title, description }) => {
  const ogImageUrl = defaultOgImage
  const twImageUrl = defaultOgImage
  const router = useRouter()
  return (
    <>
      <CommonSEO
        title={title}
        description={description}
        ogType="website"
        ogImage={ogImageUrl}
        twImage={twImageUrl}
      />
      <Head>
        <link
          rel="alternate"
          type="application/rss+xml"
          title={`${description} - RSS feed`}
          href={`${siteMetadata.siteUrl}${router.asPath}/feed.xml`}
        />
      </Head>
    </>
  )
}

export const BlogSEO = ({
  authorDetails,
  title,
  subtitle,
  summary,
  date,
  lastmod,
  url,
  images = [],
  canonicalUrl,
}) => {
  const router = useRouter()
  // The COMPLETE "Head: Tail" title for <title>/og:title/twitter:title/headline.
  const completeTitle = fullTitle({ title, subtitle })
  const publishedAt = new Date(date).toISOString()
  const modifiedAt = new Date(lastmod || date).toISOString()
  let imagesArr =
    images.length === 0
      ? [siteMetadata.socialBanner]
      : typeof images === 'string'
      ? [images]
      : images

  const featuredImages = imagesArr.map((img) => {
    return {
      '@type': 'ImageObject',
      url: `${siteMetadata.siteUrl}${img}`,
    }
  })

  let authorList
  if (authorDetails) {
    authorList = authorDetails.map((author) => {
      return {
        '@type': 'Person',
        name: author.name,
      }
    })
  } else {
    authorList = {
      '@type': 'Person',
      name: siteMetadata.author,
    }
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
    headline: completeTitle,
    image: featuredImages,
    datePublished: publishedAt,
    dateModified: modifiedAt,
    author: authorList,
    publisher: {
      '@type': 'Organization',
      name: siteMetadata.author,
      logo: {
        '@type': 'ImageObject',
        url: `${siteMetadata.siteUrl}${siteMetadata.siteLogo}`,
      },
    },
    description: summary,
  }

  // Branded, dynamically rendered social card is the canonical og/twitter image
  // for every post (overrides the in-article hero). `featuredImages` is still
  // used for JSON-LD structured data below.
  const socialImageUrl = postOgImage(title, subtitle)

  return (
    <>
      <CommonSEO
        title={completeTitle}
        description={summary}
        ogType="article"
        ogImage={socialImageUrl}
        twImage={socialImageUrl}
        canonicalUrl={canonicalUrl}
      />
      <Head>
        {date && <meta property="article:published_time" content={publishedAt} />}
        {lastmod && <meta property="article:modified_time" content={modifiedAt} />}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData, null, 2),
          }}
        />
      </Head>
    </>
  )
}

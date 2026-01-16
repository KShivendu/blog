import { MDXLayoutRenderer } from '@/components/MDXComponents'
import { getFileBySlug } from '@/lib/mdx'

const DEFAULT_LAYOUT = 'PostSimple'

export async function getStaticProps() {
  const serviceDetails = await getFileBySlug('custom', ['services'])
  return { props: { serviceDetails } }
}

export default function About({ serviceDetails }) {
  const { mdxSource, frontMatter } = serviceDetails

  return (
    <MDXLayoutRenderer
      layout={frontMatter.layout || DEFAULT_LAYOUT}
      mdxSource={mdxSource}
      frontMatter={frontMatter}
    />
  )
}

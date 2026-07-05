/* eslint-disable react/display-name */
import { useMemo } from 'react'
import { getMDXComponent } from 'mdx-bundler/client'
import Image from './Image'
import CustomLink from './Link'
import TOCInline from './TOCInline'
import Pre from './Pre'
import { BlogNewsletterForm } from './NewsletterForm'
import PlotlyChart from './PlotlyChart'
import SpladeVsIF from './SpladeVsIF'
import TokenCompressionPipeline from './TokenCompressionPipeline'
import CompressionWidget from './CompressionWidget'
import HighDimOrthogonality from './HighDimOrthogonality'
import NSphereGlobe from './NSphereGlobe'
import ResizingIframe from './ResizingIframe'
import StaticEmbeddingDemo from './StaticEmbeddingDemo'
import StaticPipeline from './StaticPipeline'

export const MDXComponents = {
  Image,
  TOCInline,
  a: CustomLink,
  pre: Pre,
  BlogNewsletterForm: BlogNewsletterForm,
  PlotlyChart,
  SpladeVsIF,
  TokenCompressionPipeline,
  CompressionWidget,
  HighDimOrthogonality,
  NSphereGlobe,
  ResizingIframe,
  StaticEmbeddingDemo,
  StaticPipeline,
  wrapper: ({ components, layout, ...rest }) => {
    const Layout = require(`../layouts/${layout}`).default
    return <Layout {...rest} />
  },
}

export const MDXLayoutRenderer = ({ layout, mdxSource, ...rest }) => {
  const MDXLayout = useMemo(() => getMDXComponent(mdxSource), [mdxSource])

  return <MDXLayout layout={layout} components={MDXComponents} {...rest} />
}

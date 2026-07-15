/* eslint-disable react/display-name */
import { useMemo } from 'react'
import { getMDXComponent } from 'mdx-bundler/client'
import Image from './Image'
import CustomLink from './Link'
import TOCInline from './TOCInline'
import Pre from './Pre'
import { BlogNewsletterForm } from './NewsletterForm'
import PlotlyChart from './PlotlyChart'
import LineChart from './LineChart'
import BarChart from './BarChart'
import SpladeVsIF from './SpladeVsIF'
import TokenCompressionPipeline from './TokenCompressionPipeline'
import TokenCompressionAnimated from './TokenCompressionAnimated'
import CompressionWidget from './CompressionWidget'
import PerpendicularCircle from './PerpendicularCircle'
import CosineWalk from './CosineWalk'
import NSphereGlobe from './NSphereGlobe'
import ResizingIframe from './ResizingIframe'
import StaticEmbeddingDemo from './StaticEmbeddingDemo'
import StaticPipeline from './StaticPipeline'
import Term from './Term'

export const MDXComponents = {
  Image,
  TOCInline,
  a: CustomLink,
  pre: Pre,
  BlogNewsletterForm: BlogNewsletterForm,
  PlotlyChart,
  LineChart,
  BarChart,
  SpladeVsIF,
  TokenCompressionPipeline,
  TokenCompressionAnimated,
  CompressionWidget,
  PerpendicularCircle,
  CosineWalk,
  NSphereGlobe,
  ResizingIframe,
  StaticEmbeddingDemo,
  StaticPipeline,
  Term,
  // Standard HTML <abbr title="…">term</abbr> renders as our styled tooltip
  // (dashed underline + hover popup); degrades to a plain abbreviation in any
  // other markdown renderer. Falls back to a bare <abbr> if no title is given.
  abbr: ({ title, children, ...rest }) =>
    title ? <Term def={title}>{children}</Term> : <abbr {...rest}>{children}</abbr>,
  wrapper: ({ components, layout, ...rest }) => {
    const Layout = require(`../layouts/${layout}`).default
    return <Layout {...rest} />
  },
}

export const MDXLayoutRenderer = ({ layout, mdxSource, ...rest }) => {
  const MDXLayout = useMemo(() => getMDXComponent(mdxSource), [mdxSource])

  return <MDXLayout layout={layout} components={MDXComponents} {...rest} />
}

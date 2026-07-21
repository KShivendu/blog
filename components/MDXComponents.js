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
import LoadModelAnimated from './LoadModelAnimated'
import CoordinatedOmission from './CoordinatedOmission'
import { ClosedLoopChart, OpenLoopChart, BadHarnessChart } from './LoadTestCharts'
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
  LoadModelAnimated,
  CoordinatedOmission,
  ClosedLoopChart,
  OpenLoopChart,
  BadHarnessChart,
  Term,
  wrapper: ({ components, layout, ...rest }) => {
    const Layout = require(`../layouts/${layout}`).default
    return <Layout {...rest} />
  },
}

export const MDXLayoutRenderer = ({ layout, mdxSource, ...rest }) => {
  const MDXLayout = useMemo(() => getMDXComponent(mdxSource), [mdxSource])

  return <MDXLayout layout={layout} components={MDXComponents} {...rest} />
}

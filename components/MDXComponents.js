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
import VocabHistogram from './VocabHistogram'
import PostingCurves from './PostingCurves'
import ZipfSpiral from './ZipfSpiral'
import DecadeFacets from './DecadeFacets'
import SpladeVsIF from './SpladeVsIF'
import TokenCompressionPipeline from './TokenCompressionPipeline'
import TokenCompressionAnimated from './TokenCompressionAnimated'
import TokenSearchAnalyzer from './TokenSearchAnalyzer'
import RegexChopper from './RegexChopper'
import RegexFilterPipeline from './RegexFilterPipeline'
import QueryShapes from './QueryShapes'
import StemExpandHero from './StemExpandHero'
import SimilarityGate from './SimilarityGate'
import CompressionWidget from './CompressionWidget'
import PerpendicularCircle from './PerpendicularCircle'
import CosineWalk from './CosineWalk'
import NSphereGlobe from './NSphereGlobe'
import ResizingIframe from './ResizingIframe'
import StaticEmbeddingDemo from './StaticEmbeddingDemo'
import StaticPipeline from './StaticPipeline'
import LoadModelAnimated from './LoadModelAnimated'
import CoordinatedOmission from './CoordinatedOmission'
import ScoreHistogram from './ScoreHistogram'
import FlagSide from './FlagSide'
import QueryExplorer from './QueryExplorer'
import SpaceSlotHero from './SpaceSlotHero'
import { ClosedLoopChart, OpenLoopChart, BadHarnessChart } from './LoadTestCharts'
import VocabSweep from './VocabSweep'
import WordpieceSplit from './WordpieceSplit'
import ThreeChannels from './ThreeChannels'
import PieceDerivation from './PieceDerivation'
import WeightHandoff from './WeightHandoff'
import Term from './Term'
import GroundedExpansionAnim from './GroundedExpansionAnim'
import PassageColors from './PassageColors'

export const MDXComponents = {
  Image,
  TOCInline,
  a: CustomLink,
  pre: Pre,
  BlogNewsletterForm: BlogNewsletterForm,
  PlotlyChart,
  LineChart,
  BarChart,
  VocabHistogram,
  PostingCurves,
  ZipfSpiral,
  DecadeFacets,
  SpladeVsIF,
  TokenCompressionPipeline,
  TokenCompressionAnimated,
  TokenSearchAnalyzer,
  RegexChopper,
  RegexFilterPipeline,
  QueryShapes,
  StemExpandHero,
  SimilarityGate,
  CompressionWidget,
  PerpendicularCircle,
  CosineWalk,
  NSphereGlobe,
  ResizingIframe,
  StaticEmbeddingDemo,
  StaticPipeline,
  LoadModelAnimated,
  CoordinatedOmission,
  ScoreHistogram,
  FlagSide,
  QueryExplorer,
  SpaceSlotHero,
  ClosedLoopChart,
  OpenLoopChart,
  BadHarnessChart,
  VocabSweep,
  WordpieceSplit,
  ThreeChannels,
  PieceDerivation,
  WeightHandoff,
  Term,
  GroundedExpansionAnim,
  PassageColors,
  wrapper: ({ components, layout, ...rest }) => {
    const Layout = require(`../layouts/${layout}`).default
    return <Layout {...rest} />
  },
}

export const MDXLayoutRenderer = ({ layout, mdxSource, ...rest }) => {
  const MDXLayout = useMemo(() => getMDXComponent(mdxSource), [mdxSource])

  return <MDXLayout layout={layout} components={MDXComponents} {...rest} />
}

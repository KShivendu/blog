import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { vizPalette } from './viz-palette'
import { labChrome } from './wordpiece-lab'

/*
 * Shared chrome for the grounded-expansion figures. Their data comes in as props
 * from the post, which imports /static/data/cheap-rewriter.json, written by
 * research/query-rewriter/qrw/export_blog.py.
 *
 * Colour roles, one meaning each across the post:
 *   picker   series0      the small model this post is about
 *   llm      series1      the LLM and the words it chose
 *   counts   series2      RM3, and seriesAlt2 for summed BM25
 *   bound    mutedAlt     random
 *   good               polarity, only for "relevant doc"
 */
export function useChrome() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const vp = vizPalette(dark)
  return {
    ...labChrome(dark),
    picker: vp.series0,
    llm: vp.series1,
    counts: vp.series2,
    countsAlt: vp.seriesAlt2,
    bound: vp.mutedAlt,
    good: vp.good,
    bad: vp.bad,
  }
}

export function moveColor(c, before, after) {
  if (after > before + 1e-6) return c.good
  if (after < before - 1e-6) return c.bad
  return c.muted
}

export const fmt = (v) => Number(v).toFixed(2)

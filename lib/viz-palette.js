/*
 * viz-palette.js — one source of truth for chart colour, light and dark.
 *
 * The site is green. So the charts are green: one hue family carries magnitude,
 * and the few things that aren't magnitude get their own fixed slot. A chart
 * never picks a hex; it names a ROLE here and gets the step validated for the
 * surface it's drawn on.
 *
 * Three kinds of role, and they don't mix:
 *
 *   ORDERED   p10 / p25 / p50. One hue, stepped by lightness. Darker green means
 *             deeper into the tail. Only for values that have an order.
 *   IDENTITY  series[0..3]. Fixed slots, never cycled: the ORDER is the
 *             colourblind-safety mechanism, so a 5th series folds into "other"
 *             or becomes its own facet.
 *   POLARITY  bad / neutral / good. Reserved. Never spend these on identity.
 *
 * The mean is deliberately grey. The whole argument of relevance-tail.mdx is that
 * the mean is the number you should stop leading with, so it reads as reference
 * furniture next to the greens rather than as a fourth statistic.
 *
 * Measured with scripts/color-check.py. dE is OKLab distance x100, floor 15.
 *
 *   ordered ramp      light  L 0.665 / 0.503 / 0.353, adjacent dE 16.7 and 15.5
 *                     dark   L 0.479 / 0.645 / 0.810, adjacent dE 16.9 and 16.6
 *   mean vs everything  light  dE 14.2 min, 3.95:1 on surface
 *                       dark   dE 14.1 min, 4.64:1 on surface
 *   identity series   light  worst pair dE 18.0 (green vs blue), all >= 3.08:1
 *                     dark   worst pair dE 19.3 (green vs amber), all >= 4.04:1
 *   polarity trio     light  worst pair dE 23.0    dark  worst pair dE 24.5
 *
 * Two places fall short of a floor, both on purpose. Light p50 #00b066 sits at
 * 2.76:1, because three steps of one hue on a white surface cannot be both 15
 * apart and 3:1 at once. The mean lands at 14.2 dE from p25, because a grey that
 * matches the site's green tint gives up about a point of distance. Every mark in
 * both charts carries its own text label, which is what covers the gap.
 */

// ORDERED. Weakest percentile first. On light the family darkens as the percentile
// drops; on dark it brightens. Either way, more ink against the surface means
// further down the tail.
const RAMP_LIGHT = { p10: '#004826', p25: '#007844', p50: '#00b066' }
const RAMP_DARK = { p10: '#62dca6', p25: '#09a773', p50: '#016f4b' }

// IDENTITY. Green leads because it is the site's link and logo colour
// (primary.500 in tailwind.config.js), so a chart's first series matches the
// page around it. The remaining order green -> blue -> amber -> magenta was
// picked by enumerating all 24 orderings: it ties for the best worst-adjacent
// separation under simulated deutan and protan vision.
const SERIES_LIGHT = ['#047857', '#0f74c5', '#c38406', '#cd4290']
const SERIES_DARK = ['#18ac77', '#2f8adc', '#c58506', '#ca358b']

// The mean, and any statistic that is pinned and therefore says nothing. Tinted
// green (hue 159 and 150) to sit in the same family as the site's own neutrals,
// gray-400 #8A968E and gray-300 #C8CFC9. A pure neutral separates about 1 dE
// better, because moving away from the ramp's hue is what buys the distance, but
// it reads as a foreign colour next to the greens.
const MUTED_LIGHT = '#78807b'
const MUTED_DARK = '#777e78'

export function vizPalette(dark) {
  const ramp = dark ? RAMP_DARK : RAMP_LIGHT
  const muted = dark ? MUTED_DARK : MUTED_LIGHT

  return {
    series: dark ? SERIES_DARK : SERIES_LIGHT,

    // ordered percentile family
    p10: ramp.p10,
    p25: ramp.p25,
    p50: ramp.p50,
    statP10: ramp.p10,
    statP25: ramp.p25,
    statP50: ramp.p50,

    // the mean, and saturated statistics that can't move
    mean: muted,
    statMean: muted,
    statMuted: muted,

    // polarity, reserved
    bad: dark ? '#de3c1b' : '#cf2318',
    neutral: dark ? '#365947' : '#8fb19f',
    good: dark ? '#18ac77' : '#047857',
  }
}

export { RAMP_LIGHT, RAMP_DARK, SERIES_LIGHT, SERIES_DARK, MUTED_LIGHT, MUTED_DARK }

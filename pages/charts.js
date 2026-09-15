import Head from 'next/head'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import BarChart from '@/components/BarChart'
import LineChart from '@/components/LineChart'
import { vizPalette, chartChrome } from '@/lib/viz-palette'

/**
 * Local chart gallery: every chart type and every palette role on one page, so a
 * colour or layout change can be checked in both themes without hunting through
 * posts. Reachable at /charts when running `npm run dev`.
 *
 * getStaticProps 404s this in production, so it ships with the repo but never
 * with the site.
 */
export async function getStaticProps() {
  if (process.env.NODE_ENV === 'production') return { notFound: true }
  return { props: {} }
}

// WCAG relative luminance, for the contrast column in the swatch table.
const lum = (hex) => {
  const h = hex.replace('#', '')
  const lin = (v) => {
    const c = parseInt(v, 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(h.slice(0, 2)) + 0.7152 * lin(h.slice(2, 4)) + 0.0722 * lin(h.slice(4, 6))
}
const contrast = (fg, bg) => {
  const [lo, hi] = [lum(fg), lum(bg)].sort((a, b) => a - b)
  return (hi + 0.05) / (lo + 0.05)
}

function Section({ id, title, note, children }) {
  return (
    <section className="mb-14" id={id}>
      <h2 className="mb-1 font-mono text-sm font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h2>
      {note && <p className="mb-3 max-w-3xl text-xs text-gray-500 dark:text-gray-400">{note}</p>}
      {children}
    </section>
  )
}

function Swatches({ items, surface }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {items.map(({ role, hex }) => {
        const c = contrast(hex, surface)
        return (
          <div
            key={role}
            className="flex items-center gap-2 rounded border border-gray-200 p-2 dark:border-gray-800"
          >
            <span
              className="h-8 w-8 flex-none rounded"
              style={{ background: hex }}
              aria-hidden="true"
            />
            <span className="min-w-0 font-mono text-[11px] leading-tight">
              <span className="block truncate text-gray-900 dark:text-gray-100">{role}</span>
              <span className="block text-gray-500 dark:text-gray-400">{hex}</span>
              <span className={c >= 3 ? 'text-gray-500 dark:text-gray-400' : 'text-red-600'}>
                {c.toFixed(2)}:1
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

const CATS = ['alpha', 'beta', 'gamma', 'delta']

export default function ChartGallery() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'

  const P = vizPalette(dark)
  const C = chartChrome(dark)
  const surface = C.card

  const ordered = [
    { role: 'statP50', hex: P.statP50 },
    { role: 'statP25', hex: P.statP25 },
    { role: 'statP10', hex: P.statP10 },
  ]
  const identity = [
    ...P.series.map((hex, i) => ({ role: `series[${i}]`, hex })),
    ...P.seriesAlt.map((hex, i) => ({ role: `seriesAlt[${i}]`, hex })),
  ]
  const reserved = [
    { role: 'bad', hex: P.bad },
    { role: 'neutral', hex: P.neutral },
    { role: 'good', hex: P.good },
    { role: 'statMean / statMuted', hex: P.statMean },
    { role: 'mutedAlt', hex: P.mutedAlt },
  ]

  return (
    <>
      <Head>
        <title>Chart gallery</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <div className="mx-auto max-w-[980px] py-8">
        <h1 className="mb-1 font-mono text-lg font-bold text-gray-900 dark:text-gray-100">
          Chart gallery
        </h1>
        <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">
          Every chart type and palette role in one place. Toggle the site theme to check both
          surfaces. Rules are in <code className="font-mono text-xs">chart-style.md</code>.
        </p>
        <p className="mb-10 font-mono text-xs text-gray-500 dark:text-gray-400">
          surface {surface} · {dark ? 'dark' : 'light'} · contrast shown per swatch, red under 3:1
        </p>

        <Section
          id="ordered"
          title="Ordered roles"
          note="One hue stepped by lightness, for values that have an order. Darker green means further down the tail on white; lighter means the same on the dark card. Never give an ordered family separate hues."
        >
          <Swatches items={ordered} surface={surface} />
        </Section>

        <Section
          id="identity"
          title="Identity roles"
          note="Fixed slots assigned in order, never cycled: the order is what keeps them apart under deutan and protan vision. seriesAlt[i] is the second member of family i, for series that come in pairs."
        >
          <Swatches items={identity} surface={surface} />
        </Section>

        <Section
          id="reserved"
          title="Reserved and muted"
          note="bad / neutral / good are polarity and never stand for identity. The greys are for a statistic that is a reference rather than a finding, and for any statistic pinned where it cannot move."
        >
          <Swatches items={reserved} surface={surface} />
        </Section>

        <Section
          id="bar-vertical"
          title="BarChart · vertical, grouped, identity roles"
          note="Four series through the four identity slots."
        >
          <BarChart
            title="Grouped, four identity slots"
            valueLabel="value"
            categories={CATS}
            series={[
              { name: 'one', role: 'series', values: [34, 51, 22, 47], color: P.series[0] },
              { name: 'two', values: [28, 39, 44, 19], color: P.series[1] },
              { name: 'three', values: [12, 26, 37, 31], color: P.series[2] },
              { name: 'four', values: [41, 15, 29, 24], color: P.series[3] },
            ]}
          />
        </Section>

        <Section
          id="bar-pairs"
          title="BarChart · three families of two"
          note="What to do instead of reaching for a fifth and sixth hue. Each family is one hue with seriesAlt as its second step."
        >
          <BarChart
            title="Families, not more hues"
            valueLabel="value"
            categories={CATS}
            series={[
              { name: 'word', values: [34, 51, 22, 47], color: P.series[0] },
              { name: 'word+stem', values: [30, 44, 26, 40], color: P.seriesAlt[0] },
              { name: 'naive', values: [28, 39, 44, 19], color: P.series[1] },
              { name: 'normalized', values: [24, 33, 38, 22], color: P.seriesAlt[1] },
              { name: 'bigram', values: [12, 26, 37, 31], color: P.series[2] },
              { name: 'trigram', values: [16, 21, 31, 27], color: P.seriesAlt[2] },
            ]}
          />
        </Section>

        <Section
          id="bar-horizontal"
          title="BarChart · horizontal, ordered roles"
          note="The shape the relevance-tail post uses: a grey mean over an ordered green ramp."
        >
          <BarChart
            orientation="horizontal"
            title="Mean over an ordered ramp"
            valueLabel="score"
            valueMax={100}
            valueTicks={[0, 25, 50, 75, 100]}
            categories={['NDCG@10', 'recall@10', 'recall@100']}
            series={[
              {
                name: 'mean',
                role: 'statMean',
                values: [52.5, 56.3, 76.5],
                text: ['52.5', '56.3', '76.5'],
                textPosition: 'outside',
              },
              {
                name: 'p50',
                role: 'statP50',
                values: [55.4, 50, 100],
                text: ['55.4', '50.0', '100'],
                textPosition: 'outside',
              },
              {
                name: 'p25',
                role: 'statP25',
                values: [21.9, 13.7, 50],
                text: ['21.9', '13.7', '50.0'],
                textPosition: 'outside',
              },
              {
                name: 'p10',
                role: 'statP10',
                values: [0, 0, 12.6],
                text: ['0.0', '0.0', '12.6'],
                textPosition: 'outside',
              },
            ]}
          />
        </Section>

        <Section
          id="bar-markers"
          title="BarChart · markers and pills"
          note="Labels ride a pill in the marker's colour, so the text contrasts with the pill rather than the card. side puts a pill left or right of its line and flips only when that side has no room; row stacks labels that would collide; solid drops the dash."
        >
          <BarChart
            title="side: left, side: right, row, and solid"
            valueLabel="queries"
            catLabel="score (x100)"
            categories={Array.from({ length: 12 }, (_, i) => String(i * 10))}
            catTicks={[
              { at: 0, label: '0' },
              { at: 3, label: '25' },
              { at: 6, label: '50' },
              { at: 9, label: '75' },
              { at: 12, label: '100' },
            ]}
            series={[
              {
                name: 'queries',
                values: [119, 4, 21, 35, 60, 27, 45, 81, 33, 28, 17, 129],
                colors: Array.from({ length: 12 }, (_, i) =>
                  i === 0 ? P.bad : i === 11 ? P.good : P.neutral
                ),
              },
            ]}
            markers={[
              { at: 0.2, label: 'p10 0.0', color: P.statP10 },
              { at: 3.1, label: 'p25 21.9', color: P.statP25, side: 'left' },
              { at: 6.6, label: 'p50 55.4', color: P.statP50 },
              { at: 6.3, label: 'mean 52.5', color: P.statMean, row: 1, side: 'left' },
              { at: 9.4, label: 'solid', color: P.series[1], solid: true, row: 2 },
            ]}
          />
        </Section>

        <Section
          id="bar-stacked"
          title="BarChart · grouped-stacked"
          note="Series sharing a group key stack; distinct groups sit side by side."
        >
          <BarChart
            stacked
            title="Encode and decode, raw and packed"
            valueLabel="microseconds"
            categories={['LZ4', 'r50k + ANS', 'o200k + ANS']}
            series={[
              { name: 'encode', group: 'e', color: P.series[1], values: [15, 43, 38] },
              { name: 'encode (packed)', group: 'e', color: P.seriesAlt[1], values: [4, 9, 11] },
              { name: 'decode', group: 'd', color: P.series[0], values: [1, 4, 6] },
              { name: 'decode (packed)', group: 'd', color: P.seriesAlt[0], values: [3, 15, 12] },
            ]}
          />
        </Section>

        <Section
          id="bar-diverging"
          title="BarChart · diverging"
          note="Negative values render below a zero baseline. Polarity roles carry the sign."
        >
          <BarChart
            diverging
            title="Change per bucket"
            valueLabel="delta"
            categories={['-30', '-20', '-10', '0', '+10', '+20', '+30']}
            series={[
              {
                name: 'delta',
                values: [-22, -35, -63, 294, 63, 44, 26],
                colors: [P.bad, P.bad, P.bad, P.neutral, P.good, P.good, P.good],
              },
            ]}
          />
        </Section>

        <Section
          id="bar-views"
          title="BarChart · view toggle"
          note="Segmented buttons switch datasets, the way the metric toggle works in a post."
        >
          <BarChart
            valueLabel="value"
            views={[
              {
                label: 'NDCG@10',
                title: 'NDCG@10',
                categories: CATS,
                series: [{ name: 'v', role: 'statP50', values: [55, 42, 61, 38] }],
              },
              {
                label: 'recall@10',
                title: 'recall@10',
                categories: CATS,
                series: [{ name: 'v', role: 'statP50', values: [50, 38, 72, 44] }],
              },
              {
                label: 'recall@100',
                title: 'recall@100',
                categories: CATS,
                series: [{ name: 'v', role: 'statP50', values: [100, 88, 94, 76] }],
              },
            ]}
          />
        </Section>

        <Section
          id="line"
          title="LineChart · all eight identity slots"
          note="Defaults come from the palette now, so a series with no colour gets the next validated slot. Markers differ per series as a second channel beyond hue."
        >
          <LineChart
            title="Eight series, no explicit colours"
            xLabel="x"
            yLabel="y"
            series={[
              'circle',
              'square',
              'triangle',
              'diamond',
              'ring',
              'star',
              'circle',
              'square',
            ].map((marker, i) => ({
              name: `series ${i}`,
              marker,
              points: Array.from({ length: 8 }, (_, x) => [x, 10 + i * 6 + Math.sin(x + i) * 4]),
            }))}
          />
        </Section>

        <Section
          id="line-band"
          title="LineChart · confidence band and a dashed fit"
          note="A ribbon in the series colour for a spread, and a dashed markerless series for a fit or reference."
        >
          <LineChart
            title="Median with a p25/p75 ribbon"
            xLabel="queries"
            yLabel="score"
            series={[
              {
                name: 'median',
                color: P.series[0],
                marker: 'circle',
                points: Array.from({ length: 8 }, (_, x) => [x, 40 + x * 5]),
                band: Array.from({ length: 8 }, (_, x) => [x, 30 + x * 5, 52 + x * 5]),
              },
              {
                name: 'linear fit',
                color: P.statMuted,
                dashed: true,
                showMarkers: false,
                points: [
                  [0, 38],
                  [7, 76],
                ],
              },
            ]}
          />
        </Section>
      </div>
    </>
  )
}

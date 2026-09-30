#!/usr/bin/env node
/*
 * shoot-post.js — screenshot one chart or widget on a post, in both themes.
 *
 * Every chart added to this blog has shipped with at least one rendering bug
 * that was invisible in the source: a view with no bars because it lacked its
 * own `categories`, a y-axis starting at 0 that squashed the whole story into
 * the top quarter, a label drawn under the first chip. So look at it.
 *
 * Usage:
 *   node scripts/shoot-post.js <slug> "<text in the chart title>" [outdir]
 *   node scripts/shoot-post.js improving-bpe "Bits per byte vs vocabulary size"
 *
 * Env: BASE_URL (default http://localhost:3000), VIEW (click this view toggle
 * first), WIDTH (default 1280)
 *
 * Reuses the repo's own playwright-core and the cached Chromium, the same way
 * check-widgets.js and record-widget.js do, so it adds no dependency.
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const WIDTH = Number(process.env.WIDTH || 1280)
const [slug, needle, outRaw] = process.argv.slice(2)
if (!slug || !needle) {
  console.error('usage: node scripts/shoot-post.js <slug> "<chart title text>" [outdir]')
  process.exit(2)
}
const OUT = outRaw || fs.mkdtempSync(path.join(os.tmpdir(), 'shoot-'))

function findChromium() {
  const cache = path.join(os.homedir(), '.cache', 'ms-playwright')
  const dirs = fs
    .readdirSync(cache)
    .filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()))
  for (const d of dirs) {
    for (const sub of ['chrome-linux64', 'chrome-linux', 'chrome-headless-shell-linux64']) {
      for (const bin of ['chrome', 'headless_shell', 'chrome-headless-shell']) {
        const exe = path.join(cache, d, sub, bin)
        if (fs.existsSync(exe)) return exe
      }
    }
  }
  throw new Error('No cached Chromium under ~/.cache/ms-playwright')
}

;(async () => {
  const { chromium } = require('playwright-core')
  const browser = await chromium.launch({ executablePath: findChromium(), headless: true })
  const errors = []
  fs.mkdirSync(OUT, { recursive: true })

  for (const theme of ['light', 'dark']) {
    const ctx = await browser.newContext({
      viewport: { width: WIDTH, height: 1400 },
      deviceScaleFactor: 2,
      colorScheme: theme,
    })
    const page = await ctx.newPage()
    // The dev server's CSP blocks Vercel analytics, which has nothing to do
    // with the chart being checked.
    const unrelated = /va\.vercel-scripts\.com|Vercel Web Analytics/
    page.on('console', (m) => {
      if (m.type() === 'error' && !unrelated.test(m.text())) errors.push(`[${theme}] ${m.text()}`)
    })
    page.on('pageerror', (e) => {
      if (!unrelated.test(e.message)) errors.push(`[${theme}] ${e.message}`)
    })
    await page.goto(`${BASE_URL}/blog/${slug}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)

    // Climb from the title text to the figure that contains the svg, so the
    // shot crops to the chart rather than the whole article.
    const box = page
      .locator('figure, div')
      .filter({ hasText: needle })
      .filter({ has: page.locator('svg') })
      .last()
    if (!(await box.count())) {
      console.error(`no chart matching ${JSON.stringify(needle)} on /blog/${slug}`)
      await browser.close()
      process.exit(1)
    }
    await box.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)

    if (process.env.VIEW) {
      const b = box.locator('button', { hasText: process.env.VIEW })
      if (await b.count()) {
        await b.first().click()
        await page.waitForTimeout(500)
      }
    }
    const file = path.join(OUT, `${slug}-${theme}.png`)
    await box.screenshot({ path: file })
    console.log(`${theme}  ${file}`)
    await ctx.close()
  }
  await browser.close()
  if (errors.length) {
    console.log('\nconsole errors:')
    errors.forEach((e) => console.log('  ' + e))
    process.exit(1)
  }
  console.log('\nno console errors')
})()

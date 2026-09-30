#!/usr/bin/env node
/*
 * grab-frames.js — screenshot one widget at N points along its own progress
 * slider, so the frames can be looked at rather than guessed about.
 *
 * This is record-widget.js's method with the video step removed. Same reason
 * for driving the slider instead of screen-recording: real-time capture on a
 * loaded machine drops and duplicates frames, and what I want here is an exact
 * picture of the widget at t=0.30, not a smooth movie.
 *
 * Usage:
 *   node scripts/grab-frames.js <slug> <nth-slider> [frames] [outdir]
 *
 *   slug        blog post slug, e.g. improving-bpe
 *   nth-slider  which input[type=range] on the page belongs to the widget,
 *               0-indexed in DOM order
 *   frames      how many evenly spaced positions to capture (default 9)
 *
 * Env: BASE_URL (default http://localhost:3000), SCALE (default 2)
 */
const fs = require('fs')
const os = require('os')
const path = require('path')

// Same browser resolution as record-widget.js: reuse the Chromium already in
// the playwright cache rather than triggering a download.
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

const REPO = path.resolve(__dirname, '..')
const DEPS = path.join(__dirname, '.record-deps')
function playwright() {
  for (const base of [REPO, DEPS]) {
    try {
      return require(require.resolve('playwright-core', { paths: [base] }))
    } catch (e) {
      /* try the next base */
    }
  }
  throw new Error('playwright-core not found. Run scripts/record-widget.js once to bootstrap it.')
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const SCALE = Number(process.env.SCALE || 2)
const [slug, nthRaw, framesRaw, outRaw] = process.argv.slice(2)
if (!slug) {
  console.error('usage: node scripts/grab-frames.js <slug> <nth-slider> [frames] [outdir]')
  process.exit(2)
}
const NTH = Number(nthRaw || 0)
const FRAMES = Number(framesRaw || 9)
const OUT = outRaw || path.join('/tmp', `frames-${slug}`)
const WIDGET = process.env.WIDGET || ''

;(async () => {
  const { chromium } = playwright()
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--force-color-profile=srgb'],
  })
  const page = await browser.newPage({
    viewport: { width: 900, height: 1100 },
    deviceScaleFactor: SCALE,
  })
  await page.goto(`${BASE_URL}/blog/${slug}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  // The slider is the widget's own progress control, so setting it is exactly
  // what the animation does, minus the clock.
  const found = await page.evaluate((nth) => {
    const s = [...document.querySelectorAll('input[type=range]')][nth]
    if (!s) return null
    s.scrollIntoView({ block: 'center' })
    const box = s.closest('div[style]')
    return { ok: true, label: s.getAttribute('aria-label') || '(no label)', has: !!box }
  }, NTH)
  if (!found) {
    console.error(`no input[type=range] at index ${NTH} on /blog/${slug}`)
    await browser.close()
    process.exit(1)
  }
  console.log(`slider ${NTH}: ${found.label}`)

  // Optional: click one of the widget's own preset buttons first, so a frame
  // set can be captured for each example rather than only the default.
  if (process.env.PRESET) {
    await page.evaluate(
      ({ w, label }) => {
        const root = document.querySelector(`[data-widget="${w}"]`)
        const b = [...root.querySelectorAll('button')].find((x) => x.textContent.trim() === label)
        if (b) b.click()
      },
      { w: WIDGET, label: process.env.PRESET }
    )
    await page.waitForTimeout(500)
  }
  await page.waitForTimeout(400)

  for (let i = 0; i < FRAMES; i++) {
    const t = FRAMES === 1 ? 0 : i / (FRAMES - 1)
    await page.evaluate(
      ({ nth, v }) => {
        const s = [...document.querySelectorAll('input[type=range]')][nth]
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
        set.call(s, String(Math.round(v * Number(s.max || 100))))
        s.dispatchEvent(new Event('input', { bubbles: true }))
      },
      { nth: NTH, v: t }
    )
    await page.waitForTimeout(260)
    // Shoot the widget's own container, not the viewport, so the frames crop
    // to the thing being judged.
    // A stable hook beats walking the DOM: the first version climbed from the
    // slider looking for a div containing an svg and landed on something the
    // screenshotter considered invisible.
    const sel = WIDGET ? `[data-widget="${WIDGET}"]` : 'article'
    const file = path.join(OUT, `t${String(Math.round(t * 100)).padStart(3, '0')}.png`)
    await page.locator(sel).first().screenshot({ path: file })
    console.log(`  t=${t.toFixed(2)} -> ${file}`)
  }
  await browser.close()
  console.log(`\n${FRAMES} frames in ${OUT}`)
})()

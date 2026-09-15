#!/usr/bin/env node
/**
 * Checks the navbar name's hover animation.
 *
 * The header ships Terminal decrypt: a block cursor eats the name right to
 * left, then it retypes left to right. Every erased cell holds its width with a
 * non-breaking space, so the three things worth guarding are that the box never
 * resizes, that the cursor and the typing head each move in one direction only,
 * and that it ends on the real name.
 *
 * Then it visits /matrix-lab and grabs both variants mid-animation so they can
 * be compared without hovering each one.
 *
 *   node scripts/check-matrix-name.mjs [origin] [outDir]
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ORIGIN = (process.argv[2] || 'http://localhost:3111').replace(/\/$/, '')
const OUT = process.argv[3] || '.'
const NAME = 'KShivendu'

// playwright-core here is a transitive dep whose pinned build may not be the one
// installed locally; fall back to whatever headless shell is on disk.
const findChromium = () => {
  const root = path.join(os.homedir(), '.cache', 'ms-playwright')
  if (!fs.existsSync(root)) return undefined
  return fs
    .readdirSync(root)
    .filter((d) => d.startsWith('chromium_headless_shell-'))
    .sort((a, b) => +b.split('-')[1] - +a.split('-')[1])
    .map((d) => path.join(root, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'))
    .find((p) => fs.existsSync(p))
}

const record = (page) =>
  page.evaluate(async () => {
    const el = document.querySelector('.matrix-name')
    const frames = []
    const t0 = performance.now()
    await new Promise((resolve) => {
      const sample = () => {
        const kids = [...el.children]
        frames.push({
          t: Math.round(performance.now() - t0),
          text: el.textContent,
          width: +el.getBoundingClientRect().width.toFixed(3),
          blocks: kids.filter((k) => k.classList.contains('matrix-block')).length,
          block: kids.findIndex((k) => k.classList.contains('matrix-block')),
          heads: kids.filter((k) => k.classList.contains('matrix-head')).length,
          head: kids.findIndex((k) => k.classList.contains('matrix-head')),
        })
        if (performance.now() - t0 > 1100) resolve()
        else requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    return frames
  })

const settle = async (page) => {
  await page.mouse.move(0, 300)
  await page.waitForTimeout(300)
}

const monotonic = (xs, dir) =>
  xs.every((v, i) => i === 0 || (dir > 0 ? v >= xs[i - 1] : v <= xs[i - 1]))

const run = async (page, theme) => {
  await settle(page)
  await page.emulateMedia({ colorScheme: theme })
  await page.evaluate((t) => {
    localStorage.setItem('theme', t)
    document.documentElement.classList.toggle('dark', t === 'dark')
  }, theme)
  await page.waitForTimeout(150)

  const name = page.locator('.matrix-name')
  const restWidth = (await name.boundingBox()).width
  const restText = await name.textContent()

  const recording = record(page)
  await name.hover()
  const frames = await recording

  const widths = [...new Set(frames.map((f) => f.width))]
  const changed = frames.filter((f) => f.text !== NAME)
  const erasing = frames.filter((f) => f.block >= 0)
  const typing = frames.filter((f) => f.head >= 0)
  const cursorPath = [...new Set(erasing.map((f) => f.block))]
  const headPath = [...new Set(typing.map((f) => f.head))]
  const settled = frames[frames.length - 1]

  console.log(`\n=== ${theme} ===`)
  console.log(`rest              "${restText}" @ ${restWidth.toFixed(3)}px`)
  console.log(`frames recorded   ${frames.length} over ${settled.t}ms`)
  console.log(`changed frames    ${changed.length}`)
  console.log(`cursor path       ${cursorPath.join(' -> ') || '(none)'}`)
  console.log(`typing head path  ${headPath.join(' -> ') || '(none)'}`)
  console.log(
    `sample frames     ${changed
      .slice(0, 5)
      .map((f) => `"${f.text.replace(/ /g, '.')}"`)
      .join(' ')}`
  )
  console.log(`distinct widths   ${widths.join(', ')}`)
  console.log(`final             "${settled.text}" @ ${settled.width}px`)

  const lastErase = Math.max(...erasing.map((f) => f.t))
  const firstType = Math.min(...typing.map((f) => f.t))

  const checks = [
    ['the name changes on hover', changed.length > 3],
    ['exactly one cursor block while erasing', erasing.every((f) => f.blocks === 1)],
    ['the cursor only moves left', monotonic(cursorPath, -1)],
    ['exactly one typing head', typing.every((f) => f.heads === 1)],
    ['the typing head only moves right', monotonic(headPath, +1)],
    ['erasing finishes before typing starts', lastErase < firstType],
    ['width never changes', widths.length === 1 && widths[0] === +restWidth.toFixed(3)],
    ['settles back to the real name', settled.text === NAME],
  ]
  for (const [label, ok] of checks) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)

  // Screenshot mid-retype, while part of the name is still missing.
  await settle(page)
  const shot = page.evaluate(
    () =>
      new Promise((r) =>
        setTimeout(() => r(document.querySelector('.matrix-name').textContent), 430)
      )
  )
  await name.hover()
  const midText = await shot
  await page.locator('header').screenshot({ path: path.join(OUT, `matrix-${theme}.png`) })
  console.log(`  screenshot showing "${midText.replace(/ /g, '.')}" -> matrix-${theme}.png`)

  return checks.every(([, ok]) => ok)
}

const browser = await chromium.launch({ executablePath: findChromium() })
const page = await browser.newPage({ viewport: { width: 900, height: 400 } })
await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)

const results = []
for (const theme of ['light', 'dark']) results.push(await run(page, theme))

// Leaving mid-animation must restore the real name at once.
const name = page.locator('.matrix-name')
await settle(page)
await name.hover()
await page.waitForTimeout(150)
const during = await name.textContent()
await page.mouse.move(0, 300)
await page.waitForTimeout(80)
const after = await name.textContent()
const leaveOk = during !== NAME && after === NAME
console.log(`\n=== leave mid-animation ===`)
console.log(`during hover      "${during.replace(/ /g, '.')}"`)
console.log(`after leaving     "${after}"`)
console.log(`  ${leaveOk ? 'PASS' : 'FAIL'}  restores on mouse leave`)

// prefers-reduced-motion must skip the animation entirely.
await page.emulateMedia({ reducedMotion: 'reduce' })
await settle(page)
await name.hover()
await page.waitForTimeout(150)
const reduced = await name.textContent()
const reducedOk = reduced === NAME
console.log(`\n=== prefers-reduced-motion: reduce ===`)
console.log(`text while hovered "${reduced}"`)
console.log(`  ${reducedOk ? 'PASS' : 'FAIL'}  no animation under reduced motion`)

// ── /matrix-lab: both variants at the moment each reads best ────────────────
const SHOTS = [
  ['terminal', 180],
  ['terminal', 470],
  ['lock-white', 230],
  ['lock-white', 700],
]

let lockOk = false
const errors = []
// Dev-only noise, none of it from this feature: two requests the site's CSP
// blocks (Vercel Analytics, and the FontPicker widget's Google Fonts preview),
// plus Next's hot reloader chasing a build id that an edit has moved on from.
const NOT_OURS = ['va.vercel-scripts.com', 'fonts.googleapis.com', 'hot-update']
const ours = (t) => !NOT_OURS.some((h) => t.includes(h))
// A failed-resource console entry says only "Failed to load resource", so match
// on where it came from as well as what it says.
page.on(
  'console',
  (m) =>
    m.type() === 'error' &&
    ours(m.text()) &&
    ours(m.location()?.url || '') &&
    errors.push(`${m.text()} (${m.location()?.url || 'no url'})`)
)
page.on('requestfailed', (r) => ours(r.url()) && errors.push(`request failed: ${r.url()}`))
page.on(
  'response',
  (r) => r.status() >= 400 && ours(r.url()) && errors.push(`HTTP ${r.status()} ${r.url()}`)
)

await page.emulateMedia({ reducedMotion: 'no-preference' })
const labRes = await page.goto(`${ORIGIN}/matrix-lab`, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)

// The lab page is a local comparison aid and is deliberately not deployed, so
// everything below it is optional. The header checks above are the real ones.
const hasLab = labRes && labRes.ok()
const rowCount = hasLab ? await page.locator('[data-variant]').count() : 0
console.log(`\n=== /matrix-lab ===`)
if (!hasLab) console.log('  not present, skipping the side-by-side pass')
else console.log(`variant rows rendered  ${rowCount}`)

for (const theme of hasLab ? ['light', 'dark'] : []) {
  await page.emulateMedia({ colorScheme: theme })
  await page.evaluate((t) => {
    localStorage.setItem('theme', t)
    document.documentElement.classList.toggle('dark', t === 'dark')
  }, theme)
  await page.waitForTimeout(200)

  for (const [id, atMs] of SHOTS) {
    const row = page.locator(`[data-variant="${id}"]`)
    await row.locator('button').click()
    await page.waitForTimeout(atMs)
    await row.screenshot({ path: path.join(OUT, `lab-${theme}-${id}-${atMs}.png`) })
    await page.waitForTimeout(1600) // let it finish before the next replay
  }
  console.log(`  ${theme}: captured ${SHOTS.length} frames`)
}

// ── lock-white: the finished name has to stay lit while the pointer is there ──
if (hasLab) {
  const row = page.locator('[data-variant="lock-white"]')
  const el = row.locator('.matrix-name')
  const read = () =>
    el.evaluate((n) => {
      const kids = [...n.children]
      const fixed = kids.map((k) => k.classList.contains('matrix-fixed'))
      return {
        text: n.textContent,
        width: +n.getBoundingClientRect().width.toFixed(3),
        fixed: fixed.filter(Boolean).length,
        contiguous: fixed.every((f, i) => !f || i === 0 || fixed[i - 1]),
        // An accent-coloured shadow behind a settled white word reads as a green
        // outline on every letter, so the fixed cells must carry none.
        shadows: [
          ...new Set(kids.filter((_, i) => fixed[i]).map((k) => getComputedStyle(k).textShadow)),
        ],
      }
    })

  await page.mouse.move(0, 300)
  await page.waitForTimeout(400)
  const rest = await read()
  await el.hover()
  await page.waitForTimeout(230)
  const mid = await read()
  await page.waitForTimeout(500) // past the 450ms sweep, pointer still on it
  const held = await read()
  await page.mouse.move(0, 300)
  await page.waitForTimeout(150)
  const left = await read()

  console.log(`\n=== lock-white ===`)
  console.log(`at rest      "${rest.text}" ${rest.fixed} fixed @ ${rest.width}px`)
  console.log(`mid-sweep    "${mid.text}" ${mid.fixed} fixed @ ${mid.width}px`)
  console.log(`after sweep  "${held.text}" ${held.fixed} fixed @ ${held.width}px`)
  console.log(`pointer off  "${left.text}" ${left.fixed} fixed @ ${left.width}px`)
  console.log(`text-shadow on fixed cells: ${held.shadows.join(' | ')}`)

  const lockChecks = [
    ['nothing fixed before hover', rest.fixed === 0 && rest.text === NAME],
    ['part-fixed mid-sweep', mid.fixed > 0 && mid.fixed < NAME.length],
    ['fixed run is contiguous from the left', mid.contiguous],
    ['all nine held fixed after the sweep', held.fixed === NAME.length && held.text === NAME],
    ['releases when the pointer leaves', left.fixed === 0 && left.text === NAME],
    ['no glow on the fixed characters', held.shadows.length === 1 && held.shadows[0] === 'none'],
    ['width never changes', new Set([rest.width, mid.width, held.width, left.width]).size === 1],
  ]
  for (const [label, ok] of lockChecks) console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`)
  lockOk = lockChecks.every(([, ok]) => ok)
}

console.log(`\n=== console during the lab pass ===`)
console.log(errors.length ? errors.slice(0, 10).join('\n') : '  none')

await browser.close()
const allOk =
  results.every(Boolean) && leaveOk && reducedOk && lockOk && rowCount === 2 && !errors.length
console.log(`\n${allOk ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'}`)
process.exit(allOk ? 0 : 1)

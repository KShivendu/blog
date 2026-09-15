#!/usr/bin/env node
/**
 * Checks the author avatar as the page actually loads it: what file is served,
 * its true pixel size, and the size it renders at. The avatar is also
 * base64-inlined into every OG card, so an oversized file is paid for on every
 * social preview, not just once.
 *
 *   node scripts/check-avatar.mjs [origin] [outDir]
 */
import { chromium } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const ORIGIN = (process.argv[2] || 'http://localhost:3111').replace(/\/$/, '')
const OUT = process.argv[3] || '.'

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

const browser = await chromium.launch({ executablePath: findChromium() })
const page = await browser.newPage({ viewport: { width: 900, height: 700 } })

let bytes = 0
page.on('response', async (r) => {
  if (!/\/(_next\/image|static\/images).*shivendu/.test(r.url())) return
  try {
    bytes = (await r.body()).length
  } catch (_) {
    /* redirected or cached */
  }
})

await page.goto(`${ORIGIN}/about`, { waitUntil: 'load' })

// next/image renders two <img>: an inline SVG spacer and the real one. Pick the
// real one by its src rather than by position.
const img = page.locator('.tty-avatar img:not([src^="data:"])').first()
await img.scrollIntoViewIfNeeded()
// next/image paints an inline SVG placeholder first, so wait for the real file.
await img
  .evaluate(
    (e) =>
      new Promise((res) => {
        const done = () => e.currentSrc && !e.currentSrc.startsWith('data:') && e.naturalWidth > 0
        if (done()) return res()
        const t = setInterval(() => done() && (clearInterval(t), res()), 100)
        setTimeout(() => (clearInterval(t), res()), 8000)
      })
  )
  .catch(() => {})
const info = await img.evaluate((e) => ({
  natural: `${e.naturalWidth}x${e.naturalHeight}`,
  rendered: `${Math.round(e.getBoundingClientRect().width)}x${Math.round(
    e.getBoundingClientRect().height
  )}`,
  src: e.currentSrc,
  complete: e.complete && e.naturalWidth > 0,
}))

console.log(`src            ${info.src}`)
console.log(`natural size   ${info.natural}`)
console.log(`rendered at    ${info.rendered}`)
console.log(`bytes served   ${bytes ? `${(bytes / 1024).toFixed(0)} KB` : 'not captured'}`)

await page.locator('.tty-avatar').screenshot({ path: path.join(OUT, 'avatar.png') })
await browser.close()

const ok = info.complete
console.log(`  ${ok ? 'PASS' : 'FAIL'}  avatar loaded and decoded`)
process.exit(ok ? 0 : 1)

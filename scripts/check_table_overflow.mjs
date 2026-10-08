// Check a post for tables that are wider than their column, at desktop and phone widths.
//
//   node scripts/check_table_overflow.mjs <url> [extra.css]
//
// Prints, per viewport width: whether the page itself scrolls sideways, and every
// table that is wider than its column (desktop) or scrolls inside its own box (phone).
// The optional CSS file is injected before measuring, to try a fix on the live site.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const [url, cssFile] = process.argv.slice(2)
if (!url) {
  console.error('usage: node scripts/check_table_overflow.mjs <url> [extra.css]')
  process.exit(1)
}
const css = cssFile ? fs.readFileSync(cssFile, 'utf8') : null

// Use the newest headless shell Playwright has already downloaded.
const cache = path.join(os.homedir(), '.cache/ms-playwright')
const shell = fs
  .readdirSync(cache)
  .filter((d) => d.startsWith('chromium_headless_shell-'))
  .sort()
  .pop()
// The folder layout changed across Playwright versions.
const executablePath = [
  'chrome-headless-shell-linux64/chrome-headless-shell',
  'chrome-linux/headless_shell',
]
  .map((p) => path.join(cache, shell, p))
  .find((p) => fs.existsSync(p))

const WIDTHS = [1440, 1100, 768, 390, 360]
const browser = await chromium.launch({ executablePath })
for (const width of WIDTHS) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: width < 640 })
  await page.goto(url, { waitUntil: 'networkidle' })
  if (css) await page.addStyleTag({ content: css })
  await page.waitForTimeout(300)
  const r = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('.prose-tty table')].map((t) => {
      const col = t.parentElement.getBoundingClientRect().width
      return {
        head: t.querySelector('th')?.textContent.trim(),
        width: Math.round(t.getBoundingClientRect().width),
        content: t.scrollWidth,
        col: Math.round(col),
      }
    })
    return {
      pageScrollsSideways: document.documentElement.scrollWidth > innerWidth + 1,
      tooWide: rows.filter((x) => x.content > Math.min(x.width, x.col) + 1),
    }
  })
  console.log(
    `${width}px  page scrolls sideways: ${r.pageScrollsSideways ? 'YES' : 'no'}  ` +
      `tables too wide: ${r.tooWide.length ? r.tooWide.map((x) => `"${x.head}" ${x.content}px in ${Math.min(x.width, x.col)}px`).join(', ') : 'none'}`
  )
  await page.close()
}
await browser.close()

// Shared Open Graph / social-card renderer.
//
// Renders a branded 1200x630 card with satori (HTML/CSS -> SVG) then
// @resvg/resvg-js (SVG -> PNG). Imported by the dynamic endpoint at
// `pages/api/og.js`. Nothing is stored on disk — the image is produced on the
// fly and cached by the CDN.
//
// Composition follows Modal's clean, spacious social image:
//   - dark background with a VERY subtle graph-paper grid (our signature)
//   - `>_ KShivendu` wordmark top-left
//   - one big, airy, left-aligned hero title (Inter 600) with lots of negative
//     space around it
//   - a thin full-width hairline ~80px above the bottom
// No summary / date / reading-time / tags.
const fs = require('fs')
const path = require('path')
const satori = require('satori').default || require('satori')
const { Resvg } = require('@resvg/resvg-js')
const siteMetadata = require('@/data/siteMetadata')

// ---- palette (matches css/tailwind.css terminal/teletype dark theme) ----
const BG = '#0a0f0d'
const GRID = '#121a16' // very subtle graph-paper lines
const ACCENT = '#34d399'
const INK = '#dde6e0'
const MUTED = '#8a968e'
const HAIRLINE = '#2a322c'

const WIDTH = 1200
const HEIGHT = 630
const PAD = 80

// ---- fonts ----------------------------------------------------------------
// satori needs ttf/otf/woff (NOT woff2).
//
// Vercel Node serverless caveat: on Next 12.0.9 there is NO
// `experimental.outputFileTracingIncludes`, so files under `public/` are NOT
// bundled into the serverless function. We therefore try a filesystem read
// first (works in `next dev` and locally) and fall back to fetching the font
// over HTTP from the deployed `/public` dir. Fonts are read exactly once and
// cached across warm invocations via the module-scoped `fontsPromise`.
const FONT_FILES = [
  { name: 'Inter', file: 'inter-latin-400-normal.woff', weight: 400, style: 'normal' },
  { name: 'Inter', file: 'inter-latin-600-normal.woff', weight: 600, style: 'normal' },
  { name: 'Fira Code', file: 'fira-code-latin-400-normal.woff', weight: 400, style: 'normal' },
  { name: 'Fira Code', file: 'fira-code-latin-500-normal.woff', weight: 500, style: 'normal' },
]

async function loadFontData(file) {
  // 1) local filesystem (dev + any environment where public/ is present)
  try {
    const p = path.join(process.cwd(), 'public', 'static', 'fonts', file)
    return fs.readFileSync(p)
  } catch (_) {
    // 2) fetch from the deployed public dir (Vercel serverless)
    const res = await fetch(`${siteMetadata.siteUrl}/static/fonts/${file}`)
    if (!res.ok) throw new Error(`Failed to fetch font ${file}: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
}

// Author avatar (default/identity card only), loaded like the fonts: local FS
// first, HTTP fallback for the Vercel serverless function. Cached as a data URI.
let avatarPromise = null
function getAvatar() {
  if (!avatarPromise) {
    avatarPromise = (async () => {
      let buf
      try {
        buf = fs.readFileSync(
          path.join(process.cwd(), 'public', 'static', 'images', 'shivendu.jpg')
        )
      } catch (_) {
        const res = await fetch(`${siteMetadata.siteUrl}/static/images/shivendu.jpg`)
        if (!res.ok) throw new Error(`Failed to fetch avatar: ${res.status}`)
        buf = Buffer.from(await res.arrayBuffer())
      }
      return `data:image/jpeg;base64,${buf.toString('base64')}`
    })().catch((err) => {
      avatarPromise = null
      throw err
    })
  }
  return avatarPromise
}

let fontsPromise = null
function getFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all(
      FONT_FILES.map(async (f) => ({
        name: f.name,
        weight: f.weight,
        style: f.style,
        data: await loadFontData(f.file),
      }))
    ).catch((err) => {
      // reset so a later invocation can retry after a transient fetch failure
      fontsPromise = null
      throw err
    })
  }
  return fontsPromise
}

// ---- layout ---------------------------------------------------------------
// Faint 48px graph-paper grid, same construction as the site body.
const gridBackground = {
  backgroundColor: BG,
  backgroundImage: `linear-gradient(${GRID} 1px, transparent 1px), linear-gradient(90deg, ${GRID} 1px, transparent 1px)`,
  backgroundSize: '48px 48px',
}

// Auto-fit: shrink the hero font-size as the title grows so it never overflows.
function titleFontSize(title) {
  const n = title.length
  if (n <= 30) return 86
  if (n <= 50) return 74
  if (n <= 75) return 62
  if (n <= 100) return 54
  if (n <= 130) return 48
  return 46
}

// plain-object element form (satori's JSX-free API)
const el = (type, props) => ({ type, props })

function brandRow() {
  return el('div', {
    style: { display: 'flex', alignItems: 'center' },
    children: [
      el('span', {
        style: { color: ACCENT, fontFamily: 'Fira Code', fontWeight: 500, fontSize: 32 },
        children: '>_',
      }),
      el('span', {
        style: {
          color: INK,
          fontFamily: 'Inter',
          fontWeight: 600,
          fontSize: 32,
          marginLeft: 16,
          letterSpacing: '-0.01em',
        },
        children: 'KShivendu',
      }),
    ],
  })
}

function hairline() {
  return el('div', {
    style: { display: 'flex', width: '100%', height: 2, backgroundColor: HAIRLINE },
  })
}

function frame(children) {
  return el('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      width: '100%',
      height: '100%',
      padding: PAD,
      ...gridBackground,
    },
    children,
  })
}

function postCard(title) {
  return frame([
    // top group: wordmark + hero title, pushed into the upper-middle
    el('div', {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        brandRow(),
        el('div', {
          style: {
            display: 'flex',
            marginTop: 96,
            fontFamily: 'Inter',
            fontWeight: 600,
            fontSize: titleFontSize(title),
            lineHeight: 1.12,
            letterSpacing: '-0.02em',
            color: INK,
            maxHeight: 360,
            overflow: 'hidden',
          },
          children: title,
        }),
      ],
    }),
    hairline(),
  ])
}

function defaultCard(avatarSrc) {
  // Identity card: `>_ KShivendu` wordmark (handle) + circular photo + full name
  // "Kumar Shivendu" + role. Two distinct mentions (handle vs. real name).
  return frame([
    el('div', {
      style: { display: 'flex', flexDirection: 'column' },
      children: [
        brandRow(),
        el('div', {
          style: { display: 'flex', alignItems: 'center', marginTop: 72 },
          children: [
            avatarSrc &&
              el('img', {
                src: avatarSrc,
                width: 150,
                height: 150,
                style: {
                  width: 150,
                  height: 150,
                  borderRadius: 150,
                  objectFit: 'cover',
                  border: `2px solid ${HAIRLINE}`,
                },
              }),
            el('div', {
              style: { display: 'flex', flexDirection: 'column', marginLeft: avatarSrc ? 40 : 0 },
              children: [
                el('div', {
                  style: {
                    display: 'flex',
                    fontFamily: 'Inter',
                    fontWeight: 600,
                    fontSize: 76,
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                    color: INK,
                  },
                  children: 'Kumar Shivendu',
                }),
                el('div', {
                  style: {
                    display: 'flex',
                    marginTop: 14,
                    fontFamily: 'Inter',
                    fontWeight: 400,
                    fontSize: 34,
                    letterSpacing: '-0.01em',
                    color: MUTED,
                  },
                  children: 'Search & Distributed Systems Engineer',
                }),
              ].filter(Boolean),
            }),
          ].filter(Boolean),
        }),
      ],
    }),
    hairline(),
  ])
}

// Render a card to a PNG Buffer. `type` is 'post' | 'default'; an empty/blank
// title (or type !== 'post') falls back to the default card.
async function renderOgPng({ title, type } = {}) {
  const clean = typeof title === 'string' ? title.trim() : ''
  const isPost = type === 'post' && clean
  let element
  if (isPost) {
    element = postCard(clean)
  } else {
    // Photo only on the identity card; degrade gracefully if it can't load.
    let avatar = null
    try {
      avatar = await getAvatar()
    } catch (_) {
      avatar = null
    }
    element = defaultCard(avatar)
  }

  const fonts = await getFonts()
  const svg = await satori(element, { width: WIDTH, height: HEIGHT, fonts })
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: WIDTH } })
  return resvg.render().asPng()
}

module.exports = { renderOgPng, WIDTH, HEIGHT }

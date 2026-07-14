import { useEffect, useState } from 'react'

/*
 * FontPicker — a dev-only floating panel to audition fonts live on the site.
 *
 * It overrides the global --font-mono variable (and forces font-family on every
 * element) so the whole Teletype layout re-renders in the chosen face. Fonts
 * load on demand from Google Fonts. The pick is persisted to localStorage so it
 * survives navigation. Mounted only in development (see LayoutWrapper) — it is
 * never bundled into the production site.
 */

// Curated candidates. `google` is the family spec for the CSS2 API (weights
// bundled). Monospace first (matches the current all-mono design); a few
// proportional faces below to preview a break from mono — those WILL misalign
// the tabular date columns / ASCII, which is the point of previewing.
const MONO = [
  { name: 'Fira Code', google: 'Fira+Code:wght@400;500;600', note: 'current code' },
  { name: 'Geist Mono', google: 'Geist+Mono:wght@400;500;600' },
  { name: 'JetBrains Mono', google: 'JetBrains+Mono:wght@400;500;600' },
  { name: 'IBM Plex Mono', google: 'IBM+Plex+Mono:wght@400;500;600' },
  { name: 'Fira Code', google: 'Fira+Code:wght@400;500;600' },
  { name: 'Source Code Pro', google: 'Source+Code+Pro:wght@400;500;600' },
  { name: 'Roboto Mono', google: 'Roboto+Mono:wght@400;500;600' },
  { name: 'Space Mono', google: 'Space+Mono:wght@400;700' },
  { name: 'DM Mono', google: 'DM+Mono:wght@400;500' },
  { name: 'Martian Mono', google: 'Martian+Mono:wght@400;500;600' },
  { name: 'Spline Sans Mono', google: 'Spline+Sans+Mono:wght@400;500;600' },
  { name: 'Red Hat Mono', google: 'Red+Hat+Mono:wght@400;500;600' },
  { name: 'Overpass Mono', google: 'Overpass+Mono:wght@400;500;600', note: 'GT-America-like' },
  { name: 'Fragment Mono', google: 'Fragment+Mono' },
  { name: 'Commit Mono', google: 'Commit+Mono' },
  { name: 'Anonymous Pro', google: 'Anonymous+Pro:wght@400;700' },
  {
    name: 'GT America Mono',
    note: 'Oxide · paid',
    faces: [{ url: 'https://oxide.computer/fonts/GT-America-Mono-Regular-OCC.woff2', weight: 400 }],
  },
]
const PROP = [
  { name: 'Inter', google: 'Inter:wght@400;500;600', mono: false },
  {
    name: 'Hanken Grotesk',
    google: 'Hanken+Grotesk:wght@400;500;600',
    mono: false,
    note: 'Suisse-like',
  },
  {
    name: 'Schibsted Grotesk',
    google: 'Schibsted+Grotesk:wght@400;500;600',
    mono: false,
    note: 'Suisse-like',
  },
  { name: 'IBM Plex Sans', google: 'IBM+Plex+Sans:wght@400;500;600', mono: false },
  { name: 'Newsreader', google: 'Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600', mono: false },
  { name: 'Source Serif 4', google: 'Source+Serif+4:wght@400;500;600', mono: false },
  {
    name: 'SuisseIntl',
    note: 'Oxide · paid',
    mono: false,
    faces: [
      { url: 'https://oxide.computer/fonts/SuisseIntl-Regular-WebS.woff2', weight: 400 },
      {
        url: 'https://oxide.computer/fonts/SuisseIntl-RegularItalic-WebS.woff2',
        weight: 400,
        style: 'italic',
      },
    ],
  },
]

const DEFAULT = 'site default'

function ensureLoaded(spec) {
  if (!spec) return
  const id = 'fp-link-' + spec.name.replace(/\s/g, '')
  if (document.getElementById(id)) return
  // Direct @font-face URLs (e.g. auditioning a paid face from its own host).
  if (spec.faces) {
    const el = document.createElement('style')
    el.id = id
    el.textContent = spec.faces
      .map(
        (f) =>
          `@font-face{font-family:'${spec.name}';src:url('${f.url}') format('woff2');` +
          `font-weight:${f.weight || 400};font-style:${f.style || 'normal'};font-display:swap;}`
      )
      .join('\n')
    document.head.appendChild(el)
    return
  }
  if (!spec.google) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${spec.google}&display=swap`
  document.head.appendChild(link)
}

function applyFont(spec) {
  ensureLoaded(spec)
  const fallback =
    spec.mono === false ? 'system-ui, sans-serif' : 'ui-monospace, SFMono-Regular, Menlo, monospace'
  const stack = `'${spec.name}', ${fallback}`
  let el = document.getElementById('fp-style')
  if (!el) {
    el = document.createElement('style')
    el.id = 'fp-style'
    document.head.appendChild(el)
  }
  // Override the design token AND force every element (Tailwind font-* utilities
  // hardcode the family name, so the var alone won't reach them).
  el.textContent =
    `:root{--font-mono:${stack} !important}\n` +
    `body, body *:not(.fp-ui):not(.fp-ui *){font-family:${stack} !important}`
  try {
    localStorage.setItem('fp-font', spec.name)
  } catch (e) {
    /* ignore */
  }
}

const ALL = [...MONO, ...PROP]

export default function FontPicker() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(DEFAULT)

  useEffect(() => {
    let saved = null
    try {
      saved = localStorage.getItem('fp-font')
    } catch (e) {
      /* ignore */
    }
    if (saved && saved !== DEFAULT) {
      const spec = ALL.find((f) => f.name === saved)
      if (spec) {
        applyFont(spec)
        setActive(saved)
      }
    }
    // Pre-load all candidate fonts so hovering/clicking is instant.
    ALL.forEach(ensureLoaded)
  }, [])

  const pick = (spec) => {
    applyFont(spec)
    setActive(spec.name)
  }
  const reset = () => {
    const el = document.getElementById('fp-style')
    if (el) el.textContent = ''
    try {
      localStorage.removeItem('fp-font')
    } catch (e) {
      /* ignore */
    }
    setActive(DEFAULT)
  }

  const btn = {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '12px',
    cursor: 'pointer',
    border: '1px solid #888',
    background: '#111',
    color: '#eee',
    borderRadius: '6px',
    padding: '6px 10px',
    lineHeight: 1,
  }

  return (
    <div
      className="fp-ui"
      style={{
        position: 'fixed',
        left: '16px',
        bottom: '16px',
        zIndex: 9999,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      }}
    >
      {open ? (
        <div
          style={{
            width: '230px',
            maxHeight: '70vh',
            overflowY: 'auto',
            background: '#0d0f0e',
            color: '#e6ece8',
            border: '1px solid #333',
            borderRadius: '10px',
            boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            padding: '10px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#9aa' }}>font preview (dev)</span>
            <button onClick={() => setOpen(false)} style={{ ...btn, padding: '3px 7px' }}>
              ×
            </button>
          </div>
          <div style={{ fontSize: '10px', color: '#7a8', margin: '2px 0 6px' }}>MONOSPACE</div>
          {MONO.map((f) => (
            <FontRow key={f.name} f={f} active={active === f.name} onPick={() => pick(f)} />
          ))}
          <div style={{ fontSize: '10px', color: '#a87', margin: '10px 0 6px' }}>
            PROPORTIONAL — breaks alignment
          </div>
          {PROP.map((f) => (
            <FontRow key={f.name} f={f} active={active === f.name} onPick={() => pick(f)} />
          ))}
          <button onClick={reset} style={{ ...btn, width: '100%', marginTop: '10px' }}>
            reset → site default (Inter + Fira Code)
          </button>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} style={btn} title={`Font: ${active}`}>
          Aa · {active}
        </button>
      )}
    </div>
  )
}

function FontRow({ f, active, onPick }) {
  return (
    <button
      onClick={onPick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        border: 'none',
        borderRadius: '6px',
        padding: '6px 8px',
        marginBottom: '2px',
        background: active ? '#1f3a2e' : 'transparent',
        color: active ? '#8ff0c0' : '#dde',
        fontFamily: `'${f.name}', ${f.mono === false ? 'sans-serif' : 'monospace'}`,
        fontSize: '13px',
      }}
    >
      {f.name}
      {f.note ? <span style={{ color: '#788', fontSize: '10px' }}> · {f.note}</span> : ''}
      <div style={{ fontSize: '11px', opacity: 0.7 }}>vector search · 1,773 · O(N log N)</div>
    </button>
  )
}

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import data from '../public/static/data/jlens-mxbai-layers.json'
import { chartChrome, vizPalette } from '../lib/viz-palette'

// Real output of the averaged embedding Jacobian lens on mxbai-embed-large-v1 for
// "A man is playing a guitar on stage." (bake_tinystories_modal.py embjlensavg in
// the research repo). Layer 24 is left out: a nudge after the last layer can't
// reach the CLS vector, so the lens reads nothing there.

// Words about the sentence (the music, the stage, the man). Only decides colour.
const ON_TOPIC = new Set(
  (
    'guitar guitarist guitars musician musicians music instrument instrumental acoustic ' +
    'songwriter piano violin drum band concert performance performing stage stages broadway ' +
    'theater show audience man men male males guy playing player players play'
  ).split(' ')
)

const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
const LAST = data.stages.length - 2 // layer 23

export default function JLensLayers() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [layer, setLayer] = useState(12)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const C = chartChrome(dark)
  const P = vizPalette(dark)
  const row = data.averaged.top3[layer]

  return (
    <figure
      style={{
        margin: '2rem 0',
        padding: '14px 16px',
        border: `1px solid ${C.border}`,
        borderRadius: 3,
        background: C.card,
        textAlign: 'left',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 14, color: C.ink, minWidth: 64 }}>
          layer {layer}
        </span>
        <input
          type="range"
          min={0}
          max={LAST}
          value={layer}
          onChange={(e) => setLayer(Number(e.target.value))}
          aria-label="layer"
          style={{ flex: 1, accentColor: C.accent }}
        />
      </div>

      {data.tokens.map((t) => {
        const [top, ...rest] = row[t]
        return (
          <div
            key={t}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              padding: '5px 0',
              borderTop: `1px solid ${C.border}`,
              fontFamily: MONO,
              fontSize: 14,
            }}
          >
            <span style={{ color: C.muted, width: 64, flexShrink: 0 }}>{t}</span>
            <span style={{ color: C.muted }}>→</span>
            <span
              style={{
                fontWeight: 600,
                color: ON_TOPIC.has(top) ? P.series0 : C.ink,
                minWidth: 96,
              }}
            >
              {top}
            </span>
            <span style={{ color: C.muted, fontSize: 12 }}>{rest.join(', ')}</span>
          </div>
        )
      })}
    </figure>
  )
}

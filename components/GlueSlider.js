import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import DATA from '../data/isbpe-blog.json'
import { LABEL, MONO, chipStyle, labChrome } from '../lib/wordpiece-lab'

// Glue entries for is-bpe.mdx. Drag K and three things move together: the
// token count against the three BPE baselines, the xz size, and the list of
// punctuation-word pairs that just got their own entry. The list is the point:
// a reader can see that the first entries are `#(#self` and `:#param`, which
// is code, not noise.
//
// Every number and pair is real output from the paper's runs, written by
// tokenizer/exp89_blog_data.py from runs/exp138/main_code.json and
// glue_top_code.json.

const fmt = (n) => n.toLocaleString('en-US')

export default function GlueSlider() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const c = labChrome(dark)
  const green = c.channel[0]

  const steps = DATA.glue.steps
  const [i, setI] = useState(2) // 500 entries, where it first passes cl100k
  const s = steps[i]
  const rows = [
    ...DATA.glue.baselines.map((b) => ({ ...b, ours: false })),
    { name: `ISBPE + ${fmt(s.k)} glue entries`, tokens: s.tokens, xz: s.xz, ours: true },
  ]
  const hi = Math.max(...rows.map((r) => r.tokens))
  const lo = 260000
  const width = (n) => `${(100 * (n - lo)) / (hi - lo)}%`
  const shown = DATA.glue.top.slice(0, Math.min(s.k, 24))

  return (
    <div
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 3,
        padding: '16px 18px 14px',
        margin: '24px 0',
        background: c.lane,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <span style={{ ...LABEL, color: c.muted, flexShrink: 0 }}>glue entries</span>
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          value={i}
          onChange={(e) => setI(Number(e.target.value))}
          aria-label="number of glue entries"
          style={{ flex: 1, accentColor: green }}
        />
        <span
          style={{ fontFamily: MONO, fontSize: 13, color: c.ink, width: 48, textAlign: 'right' }}
        >
          {fmt(s.k)}
        </span>
      </div>

      {rows.map((r) => (
        <div key={r.name} style={{ marginBottom: 8 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: MONO,
              fontSize: 12,
              color: r.ours ? green : c.muted,
              marginBottom: 3,
              gap: 8,
            }}
          >
            <span>{r.name}</span>
            <span style={{ whiteSpace: 'nowrap' }}>
              {fmt(r.tokens)} tokens · xz {r.xz.toFixed(4)}
            </span>
          </div>
          <div style={{ height: 10, background: c.fill, borderRadius: 2 }}>
            <div
              style={{
                width: width(r.tokens),
                height: '100%',
                background: r.ours ? green : c.off,
                borderRadius: 2,
                transition: 'width 300ms ease',
              }}
            />
          </div>
        </div>
      ))}

      <div style={{ ...LABEL, color: c.muted, margin: '14px 0 8px' }}>
        {s.k === 0 ? 'no glue entries yet' : `the commonest pairs, in the order they are added`}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 30 }}>
        {shown.map(([a, b, n]) => (
          <span
            key={a + b}
            style={chipStyle(c, { tint: green })}
            title={`${fmt(n)} times in training`}
          >
            {a.replace(/#/g, '')}
            {b}
            <span style={{ opacity: 0.55, fontSize: 11 }}>{fmt(n)}</span>
          </span>
        ))}
        {s.k > shown.length ? (
          <span style={{ ...chipStyle(c, { on: false }) }}>+ {fmt(s.k - shown.length)} more</span>
        ) : null}
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: `1px solid ${c.border}`,
          fontSize: 12.5,
          color: c.muted,
          fontFamily: MONO,
          lineHeight: 1.6,
        }}
      >
        Python test file, 65,536 entries in every row. Fewer tokens and lower xz bits per byte are
        better. Each chip is one new entry and how often the pair appears in training.
      </div>
    </div>
  )
}

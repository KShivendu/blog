import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import DATA from '../data/isbpe-blog.json'
import { LABEL, MONO, hexFade, labChrome } from '../lib/wordpiece-lab'

// Widget 3 for improving-bpe.mdx: the same win read as vocabulary size.
// Drag the slider and the two bars move. The point lands when the ISBPE bar at
// V=8,192 is already shorter than the BPE bar at V=65,536, which is the
// strongest single result in the project.
//
// Rows come from tokenizer/exp67_vocab_tokens.py, which holds TOKEN COUNT fixed
// rather than compression. That distinction matters: the compression-fixed
// version gives a bigger reduction (85% against 88.3%) but lets a small
// vocabulary be paid back by streamvbyte for its smaller ids, which is the
// wrong trade to quote at a language model.

export default function VocabSweep() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const c = labChrome(dark)

  const rows = DATA.sweep.code
  const [i, setI] = useState(2) // V=8,192, the row that makes the point
  const row = rows[i]
  const ref = rows[rows.length - 1]
  const green = c.channel[0]

  const max = Math.max(...rows.map((r) => r.bpe_tokens))
  const bar = (n, tint, label, fixed) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '7px 0' }}>
      <span style={{ ...LABEL, color: c.muted, width: 96, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 20, background: c.fill, borderRadius: 2 }}>
        <div
          style={{
            width: `${(n / max) * 100}%`,
            height: '100%',
            // The fixed reference keeps BPE's red but as a dashed outline over
            // a hatch, so it reads as a marker that does not move, not as a
            // disabled bar.
            background: fixed
              ? `repeating-linear-gradient(135deg, ${hexFade(
                  tint,
                  0.35
                )} 0 4px, transparent 4px 8px)`
              : tint,
            border: fixed ? `1.5px dashed ${tint}` : 'none',
            boxSizing: 'border-box',
            borderRadius: 2,
            transition: 'width 260ms ease',
          }}
        />
      </div>
      <span
        style={{ fontFamily: MONO, fontSize: 12.5, color: c.ink, width: 74, textAlign: 'right' }}
      >
        {n.toLocaleString('en-US')}
      </span>
    </div>
  )

  const beatsRef = row.isbpe_tokens < ref.bpe_tokens

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
      <div style={{ ...LABEL, color: c.muted, marginBottom: 12 }}>
        tokens emitted on 1.3 MB of held-out Python, lower is better
      </div>

      {bar(row.bpe_tokens, c.bad, `BPE @ ${row.v.toLocaleString('en-US')}`)}
      {bar(row.isbpe_tokens, green, `ISBPE @ ${row.v.toLocaleString('en-US')}`)}
      {bar(ref.bpe_tokens, c.bad, `BPE @ ${ref.v.toLocaleString('en-US')}`, true)}
      <div style={{ ...LABEL, color: c.muted, textAlign: 'right', marginTop: -2 }}>
        dashed bar: fixed BPE reference, does not move with the slider
      </div>

      <input
        type="range"
        min={0}
        max={rows.length - 1}
        value={i}
        onChange={(e) => setI(Number(e.target.value))}
        aria-label="vocabulary size"
        style={{ width: '100%', marginTop: 12, accentColor: green }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', ...LABEL, color: c.muted }}>
        <span>{rows[0].v.toLocaleString('en-US')}</span>
        <span>vocabulary size</span>
        <span>{ref.v.toLocaleString('en-US')}</span>
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: `1px solid ${c.border}`,
          fontSize: 12.5,
          color: c.ink,
          lineHeight: 1.65,
        }}
      >
        {beatsRef ? (
          <>
            ISBPE with <b style={{ color: green }}>{row.v.toLocaleString('en-US')}</b> slots emits{' '}
            <b style={{ color: green }}>
              {(ref.bpe_tokens - row.isbpe_tokens).toLocaleString('en-US')} fewer
            </b>{' '}
            tokens than BPE with {ref.v.toLocaleString('en-US')}.
          </>
        ) : (
          <>
            At {row.v.toLocaleString('en-US')} slots ISBPE still emits{' '}
            {(row.isbpe_tokens - ref.bpe_tokens).toLocaleString('en-US')} more tokens than BPE at{' '}
            {ref.v.toLocaleString('en-US')}.
          </>
        )}{' '}
        <span style={{ color: c.muted }}>
          The crossing is at vocabulary size {DATA.sweep.crossing.toLocaleString('en-US')}, a
          vocabulary {(100 * (1 - DATA.sweep.crossing / DATA.sweep.ref)).toFixed(1)}% smaller.
        </span>
      </div>
    </div>
  )
}

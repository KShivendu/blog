import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import DATA from '../data/isbpe-blog.json'
import { LABEL, MONO, chipStyle, labChrome, segButton } from '../lib/wordpiece-lab'

// Widget 2 for improving-bpe.mdx: which side of the boundary carries the mark.
// The post can only tell you that putting the flag on the LEFT token keeps the
// word whole. This lets you switch the two schemes on the same string and watch
// it happen, which is the argument the post is actually making.
//
// All three tokenizations per string are real output from the trained
// vocabularies (tokenizer/exp89_blog_data.py). `get_attraction` is the case
// that motivated the fix and it is in the preset row on purpose.

export default function FlagSide() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const c = labChrome(dark)

  const [pick, setPick] = useState(0)
  const [scheme, setScheme] = useState('dual')
  const row = DATA.flagside[pick]
  const pieces = row[scheme]
  const green = c.channel[0]

  // A piece is "whole" when it is a letter run with no mark inside it. That is
  // exactly what the dual-flag rule is supposed to protect, so it gets the
  // colour and everything else stays neutral.
  const isWord = (p) => /^[A-Za-z]{2,}$/.test(p.s)

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
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
        {DATA.flagside.map((r, i) => (
          <button key={r.text} onClick={() => setPick(i)} style={segButton(c, i === pick)}>
            {r.text}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
        {[
          ['bpe', 'BPE'],
          ['single', 'mark on the right'],
          ['dual', 'mark on the left'],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setScheme(k)} style={segButton(c, scheme === k)}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 32 }}>
        {pieces.map((p, i) => (
          <span
            key={i}
            style={{
              ...chipStyle(c, { tint: isWord(p) ? green : undefined }),
              transition: 'all 220ms ease',
            }}
          >
            {p.l ? <span style={{ opacity: 0.55 }}>#</span> : null}
            {p.s === ' ' ? '·' : p.s}
            {p.r ? <span style={{ opacity: 0.55 }}>#</span> : null}
          </span>
        ))}
      </div>

      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: `1px solid ${c.border}`,
          fontSize: 12.5,
          color: c.muted,
          fontFamily: MONO,
        }}
      >
        {pieces.length} tokens
        <span style={{ color: c.muted }}>
          {'   '}
          {row.corpus === 'en' ? 'English vocabulary' : 'code vocabulary'}
        </span>
        {scheme !== 'bpe' && row.single.length !== row.dual.length ? (
          <span style={{ color: c.ink }}>
            {'  '}
            (right-marked needs {row.single.length}, left-marked needs {row.dual.length})
          </span>
        ) : null}
      </div>

      <div style={{ ...LABEL, color: c.muted, marginTop: 10, lineHeight: 1.6 }}>
        green means a whole word came out in one piece. switch between the two marking rules and
        watch which one keeps it.
      </div>
    </div>
  )
}

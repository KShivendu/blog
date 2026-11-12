import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import DATA from '../data/isbpe-blog.json'
import { LABEL, MONO, chipStyle, labChrome, segButton } from '../lib/wordpiece-lab'

// Widget 2 for improving-bpe.mdx: which side of the boundary carries the mark.
// The post can only tell you that putting the flag on the LEFT token keeps the
// word whole. This lets you switch the two schemes on the same string and watch
// it happen, which is the argument the post is actually making. Both rows
// show at once so the reader compares without clicking.
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
  const row = DATA.flagside[pick]
  const green = c.channel[0]

  // A piece is "whole" when it is a letter run with no mark inside it. That is
  // exactly what the dual-flag rule is supposed to protect, so it gets the
  // colour and everything else stays neutral.
  const words = new Set(row.text.match(/[A-Za-z]+/g) || [])
  const isWord = (p) => words.has(p.s.trim())

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

      {[
        ['bpe', 'BPE'],
        ['dual', 'ISBPE'],
      ].map(([k, label]) => (
        <div
          key={k}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}
        >
          <span style={{ ...LABEL, color: c.muted, width: 48, flexShrink: 0, paddingTop: 8 }}>
            {label}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1, minHeight: 32 }}>
            {row[k].map((p, i) => (
              <span
                key={i}
                style={{
                  ...chipStyle(c, { tint: isWord(p) ? green : undefined }),
                  whiteSpace: 'pre',
                }}
              >
                {p.l ? <span style={{ opacity: 0.55 }}>#</span> : null}
                {p.s}
                {p.r ? <span style={{ opacity: 0.55 }}>#</span> : null}
              </span>
            ))}
          </div>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 12.5,
              color: c.muted,
              flexShrink: 0,
              paddingTop: 8,
              whiteSpace: 'nowrap',
            }}
          >
            {row[k].length} tokens
          </span>
        </div>
      ))}

      <div
        style={{
          marginTop: 4,
          paddingTop: 10,
          borderTop: `1px solid ${c.border}`,
          ...LABEL,
          color: c.muted,
          lineHeight: 1.6,
        }}
      >
        {row.corpus === 'en' ? 'English vocabulary' : 'code vocabulary'}, 65,536 slots. green means
        a whole word came out in one piece.
      </div>
    </div>
  )
}

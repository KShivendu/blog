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

  // Open on get_attraction, where the rule visibly pays: BPE splits
  // attraction into two pieces and ISBPE keeps it whole (4 tokens against 3).
  const start = DATA.flagside.findIndex((r) => r.text === 'get_attraction')
  const [pick, setPick] = useState(start < 0 ? 0 : start)
  const row = DATA.flagside[pick]

  // A piece is "whole" when it is a letter run with no mark inside it. That is
  // exactly what the dual-flag rule is supposed to protect. It is marked in
  // bold with an ink border, not in a colour, because red and green mean BPE
  // and ISBPE in this post and a whole word can come out of either.
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
          <span
            style={{
              ...LABEL,
              color: k === 'bpe' ? c.bad : c.channel[0],
              width: 48,
              flexShrink: 0,
              paddingTop: 8,
            }}
          >
            {label}
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, flex: 1, minHeight: 32 }}>
            {row[k].map((p, i) => (
              <span
                key={i}
                style={{
                  ...chipStyle(c),
                  // no flex gap, so a marked piece reads #.# as in the prose
                  gap: 0,
                  whiteSpace: 'pre',
                  ...(isWord(p) ? { fontWeight: 700, borderColor: c.ink } : null),
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
        {row.corpus === 'en' ? 'English vocabulary' : 'code vocabulary'}, 65,536 slots. A bold,
        outlined chip is a whole word that came out in one piece.
      </div>
    </div>
  )
}

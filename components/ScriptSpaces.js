import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

import DATA from '../data/isbpe-blog.json'
import { LABEL, MONO, chipStyle, labChrome, segButton } from '../lib/wordpiece-lab'

// Other scripts for isbpe.mdx. Chinese: BPE against ISBPE on the same
// sentence. Hindi: GPT-2's pretokenizer against ours, where the win is the
// regex rather than the space handling.
//
// Real output of the paper's 65,536-entry models, written by
// tokenizer/exp89_blog_data.py.

const fmt = (n) => n.toLocaleString('en-US')

function Chips({ pieces, c, showDoubled }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 32 }}>
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            ...chipStyle(c, { tint: showDoubled && p.d ? c.bad : undefined }),
            // no flex gap, so a marked piece reads #.# as in the prose
            gap: 0,
            whiteSpace: 'pre',
            transition: 'all 220ms ease',
          }}
        >
          {p.l ? <span style={{ opacity: 0.55 }}>#</span> : null}
          {p.s}
          {p.r ? <span style={{ opacity: 0.55 }}>#</span> : null}
        </span>
      ))}
    </div>
  )
}

export default function ScriptSpaces() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const c = labChrome(dark)

  const [script, setScript] = useState('chinese')
  const [pick, setPick] = useState(0)

  // Below 520px the label and count columns left the chips about 60px, one
  // chip per line. There the label and count share a header line instead.
  const boxRef = useRef(null)
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const el = boxRef.current
    if (!el) return undefined
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 520))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const zh = DATA.scripts.chinese[pick]
  const zt = DATA.scripts.chinese_totals
  const hi = DATA.scripts.hindi

  // Every scheme in its own row, all at once, so the reader compares without
  // clicking. BPE is red and ISBPE green, as everywhere else in the post.
  const Rows = ({ rows }) =>
    rows.map(([label, pieces, tint]) =>
      narrow ? (
        <div key={label} style={{ marginBottom: 12 }}>
          <div style={{ ...LABEL, color: tint, marginBottom: 6, lineHeight: 1.3 }}>
            {label} <span style={{ color: c.muted }}>· {pieces.length} tokens</span>
          </div>
          <Chips pieces={pieces} c={c} showDoubled={false} />
        </div>
      ) : (
        <div
          key={label}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}
        >
          <span
            style={{
              ...LABEL,
              color: tint,
              width: 120,
              flexShrink: 0,
              paddingTop: 8,
              lineHeight: 1.3,
            }}
          >
            {label}
          </span>
          <div style={{ flex: 1 }}>
            <Chips pieces={pieces} c={c} showDoubled={false} />
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
            {pieces.length} tokens
          </span>
        </div>
      )
    )

  const footer = {
    marginTop: 12,
    paddingTop: 10,
    borderTop: `1px solid ${c.border}`,
    fontSize: 12.5,
    color: c.muted,
    fontFamily: MONO,
    lineHeight: 1.65,
  }

  return (
    <div
      ref={boxRef}
      style={{
        border: `1px solid ${c.border}`,
        borderRadius: 3,
        padding: '16px 18px 14px',
        margin: '24px 0',
        background: c.lane,
      }}
    >
      <div style={{ display: 'flex', gap: 5, marginBottom: 12 }}>
        {[
          ['chinese', 'Chinese'],
          ['hindi', 'Hindi'],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setScript(k)} style={segButton(c, script === k)}>
            {label}
          </button>
        ))}
      </div>

      {script === 'chinese' ? (
        <>
          <div
            style={{
              display: 'flex',
              gap: 5,
              flexWrap: narrow ? 'nowrap' : 'wrap',
              overflowX: narrow ? 'auto' : 'visible',
              paddingBottom: narrow ? 4 : 0,
              marginBottom: 10,
            }}
          >
            {DATA.scripts.chinese.map((r, i) => (
              <button
                key={r.text}
                onClick={() => setPick(i)}
                style={{ ...segButton(c, i === pick), flexShrink: 0 }}
              >
                {r.text.length > 12 ? r.text.slice(0, 11) + '…' : r.text}
              </button>
            ))}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: c.ink, marginBottom: 2 }}>
            {zh.text}
          </div>
          <div style={{ fontSize: 12, color: c.muted, marginBottom: 12 }}>“{zh.gloss}”</div>
          <Rows
            rows={[
              ['BPE', zh.bpe, c.bad],
              ['ISBPE', zh.isbpe, c.channel[0]],
            ]}
          />
          <div style={footer}>
            whole Chinese test file: BPE {fmt(zt.bpe)} · ISBPE {fmt(zt.isbpe)} tokens
          </div>
        </>
      ) : (
        <>
          <div style={{ fontFamily: MONO, fontSize: 13, color: c.ink, marginBottom: 2 }}>
            {hi.text}
          </div>
          <div style={{ fontSize: 12, color: c.muted, marginBottom: 12 }}>“{hi.gloss}”</div>
          <Rows
            rows={[
              ["BPE, GPT-2's pretokenizer", hi.gpt2, c.muted],
              ['BPE, my pretokenizer', hi.bpe, c.bad],
              ['ISBPE', hi.isbpe, c.channel[0]],
            ]}
          />
          <div style={footer}>
            whole Hindi test file: GPT-2&apos;s pretokenizer {fmt(hi.totals.gpt2)} · ours{' '}
            {fmt(hi.totals.bpe)} · ISBPE {fmt(hi.totals.isbpe)} tokens
          </div>
        </>
      )}

      <div style={{ ...LABEL, color: c.muted, marginTop: 10, lineHeight: 1.6 }}>
        {script === 'chinese'
          ? 'Between two Chinese characters ISBPE implies no space, so Chinese text needs no # marks.'
          : "GPT-2's pretokenizer cuts at every vowel sign. Counting those signs as letters keeps each word in one chunk."}
      </div>
    </div>
  )
}

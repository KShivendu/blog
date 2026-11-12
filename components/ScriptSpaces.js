import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import DATA from '../data/isbpe-blog.json'
import { LABEL, MONO, chipStyle, labChrome, segButton } from '../lib/wordpiece-lab'

// Other scripts for is-bpe.mdx. Chinese: switch between BPE, ISBPE, and ISBPE
// without the no-space rule on the same sentence. Red chips are strings that
// vocabulary holds twice (with and without the leading mark), which is the
// waste the rule removes. Hindi: GPT-2's pretokenizer against ours, where the
// win is the regex rather than the space handling.
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
  const [zhScheme, setZhScheme] = useState('norule')
  const [hiScheme, setHiScheme] = useState('gpt2')

  const zh = DATA.scripts.chinese[pick]
  const zt = DATA.scripts.chinese_totals
  const hi = DATA.scripts.hindi
  const zhPieces = zh[zhScheme]
  const hiPieces = hi[hiScheme]
  const doubledHere = zhPieces.filter((p) => p.d).length

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
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
            {DATA.scripts.chinese.map((r, i) => (
              <button key={r.text} onClick={() => setPick(i)} style={segButton(c, i === pick)}>
                {r.text.length > 12 ? r.text.slice(0, 11) + '…' : r.text}
              </button>
            ))}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: c.ink, marginBottom: 2 }}>
            {zh.text}
          </div>
          <div style={{ fontSize: 12, color: c.muted, marginBottom: 12 }}>“{zh.gloss}”</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              ['bpe', 'BPE'],
              ['norule', 'ISBPE, space implied everywhere'],
              ['isbpe', 'ISBPE, no space between Chinese characters'],
            ].map(([k, label]) => (
              <button key={k} onClick={() => setZhScheme(k)} style={segButton(c, zhScheme === k)}>
                {label}
              </button>
            ))}
          </div>
          <Chips pieces={zhPieces} c={c} showDoubled={zhScheme !== 'bpe'} />
          <div style={footer}>
            <span style={{ color: c.ink }}>{zhPieces.length} tokens</span>
            {zhScheme !== 'bpe' ? (
              <span>
                {'  ·  '}
                {doubledHere} of them are strings this vocabulary holds both with and without the
                mark
              </span>
            ) : null}
            <br />
            whole Chinese test file: BPE {fmt(zt.bpe)} · space implied everywhere {fmt(zt.norule)} ·
            no space between Chinese characters {fmt(zt.isbpe)} tokens
            <br />
            strings held both ways: {fmt(zt.doubled_norule)} of {fmt(zt.distinct_norule)} without
            the rule, {fmt(zt.doubled_isbpe)} of {fmt(zt.distinct_isbpe)} with it
          </div>
        </>
      ) : (
        <>
          <div style={{ fontFamily: MONO, fontSize: 13, color: c.ink, marginBottom: 2 }}>
            {hi.text}
          </div>
          <div style={{ fontSize: 12, color: c.muted, marginBottom: 12 }}>“{hi.gloss}”</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              ['gpt2', "BPE, GPT-2's pretokenizer"],
              ['bpe', 'BPE, our pretokenizer'],
              ['isbpe', 'ISBPE'],
            ].map(([k, label]) => (
              <button key={k} onClick={() => setHiScheme(k)} style={segButton(c, hiScheme === k)}>
                {label}
              </button>
            ))}
          </div>
          <Chips pieces={hiPieces} c={c} showDoubled={false} />
          <div style={footer}>
            <span style={{ color: c.ink }}>{hiPieces.length} tokens</span>
            <br />
            whole Hindi test file: GPT-2&apos;s pretokenizer {fmt(hi.totals.gpt2)} · ours{' '}
            {fmt(hi.totals.bpe)} · ISBPE {fmt(hi.totals.isbpe)} tokens
          </div>
        </>
      )}

      <div style={{ ...LABEL, color: c.muted, marginTop: 10, lineHeight: 1.6 }}>
        {script === 'chinese'
          ? 'red marks a string the vocabulary stores twice, once with # and once without. the rule removes most of them.'
          : "GPT-2's pretokenizer cuts at every vowel sign. counting those signs as letters keeps each word in one chunk."}
      </div>
    </div>
  )
}

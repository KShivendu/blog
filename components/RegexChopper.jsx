import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

import { chartChrome, vizPalette } from '../lib/viz-palette'

// Hero for token-search-regex.mdx. Every regex prefilter does the same thing:
// chop the text into pieces, remember which documents each piece appeared in,
// then look the query's pieces up. The methods differ in ONE way, how they chop.
// So the hero shows one real line of code chopped three ways, with the real
// piece counts from tiktoken o200k and the sparse-gram selection rule.
//
// Visual language follows TokenSearchAnalyzer: Fira Code mono, hairline borders,
// squared corners, segmented toggles, greys for the baseline and the palette's
// green for the thing being argued for.

const LINE = 'def get_user_config(name):'
const QUERY = 'get_user'

// Real output. tiktoken o200k_base for the tokens, the CRC32 boundary rule from
// the TopK post for the sparse grams. See experiments/regex-filter/.
const METHODS = [
  {
    key: 'trigram',
    label: '3-char chunks',
    sub: 'the standard, used for decades',
    pieces: Array.from({ length: LINE.length - 2 }, (_, i) => LINE.slice(i, i + 3)),
    total: 24,
    tone: 'muted',
    note: 'Slide along one character at a time. Simple, and it makes a lot of pieces.',
  },
  {
    key: 'sparse',
    label: 'TopK sparse grams',
    sub: 'keeps every 3-char chunk, plus longer ones',
    pieces: Array.from({ length: LINE.length - 2 }, (_, i) => LINE.slice(i, i + 3)),
    extra: ['f ge', 'et_u', '_use', 'ser_', 'conf', 'nfig', 'g(na', 'g(nam'],
    total: 37,
    tone: 'muted',
    note: 'A hash picks which longer chunks to keep, so the query and the document always agree on the choice.',
  },
  {
    key: 'isbpe',
    label: 'ISBPE tokens',
    sub: 'the space stored as its absence',
    pieces: ['def', 'get', '#_#', 'user', '#_#', 'config', '#(#', 'name', '#):'],
    total: 9,
    tone: 'good',
    note: 'A flag on the neighbour marks where a space is missing, so a word never changes shape to absorb one.',
  },
  {
    key: 'token',
    label: 'BPE tokens',
    sub: 'the pieces your model already uses',
    pieces: ['def', ' get', '_user', '_config', '(name', '):'],
    total: 6,
    tone: 'good',
    note: 'Four times fewer pieces, because a token covers about four characters instead of one.',
  },
]

const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'

export default function RegexChopper() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const C = chartChrome(dark)
  const P = vizPalette(dark)

  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const wrap = useRef(null)

  useEffect(() => {
    if (paused) return undefined
    const t = setInterval(() => setI((x) => (x + 1) % METHODS.length), 4200)
    return () => clearInterval(t)
  }, [paused])

  const m = METHODS[i]
  const accent = m.tone === 'good' ? P.good : P.muted

  const box = {
    fontFamily: MONO,
    fontSize: 12,
    padding: '3px 6px',
    border: `1px solid ${C.border}`,
    borderRadius: 2,
    background: C.card,
    color: C.ink,
    whiteSpace: 'pre',
  }

  return (
    <figure
      ref={wrap}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        margin: '2rem 0',
        border: `1px solid ${C.border}`,
        borderRadius: 3,
        background: C.card,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px 4px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
          Every regex filter chops text into pieces. They differ in how.
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
          One line of Python, chopped three ways. Real pieces, not illustrations.
        </div>
      </div>

      {/* method toggle */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, padding: '10px 16px 0' }}>
        {METHODS.map((x, k) => (
          <button
            key={x.key}
            onClick={() => setI(k)}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              padding: '5px 10px',
              cursor: 'pointer',
              border: `1px solid ${C.border}`,
              borderRight: k === METHODS.length - 1 ? `1px solid ${C.border}` : 'none',
              background: k === i ? (x.tone === 'good' ? P.good : C.ink) : 'transparent',
              color: k === i ? C.card : C.muted,
            }}
          >
            {x.label}
          </button>
        ))}
      </div>

      {/* the document line, chopped */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
          a document contains this line
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 13,
            color: C.ink,
            padding: '6px 8px',
            background: dark ? '#0a0f0d' : '#f7f9f8',
            border: `1px solid ${C.border}`,
            borderRadius: 2,
            whiteSpace: 'pre',
            overflowX: 'auto',
          }}
        >
          {LINE}
        </div>

        <div style={{ fontSize: 11, color: C.muted, margin: '12px 0 6px' }}>
          chopped into <strong style={{ color: accent }}>{m.total} pieces</strong>
          {m.key === 'sparse' ? ' (24 short, 13 longer)' : ''}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {m.pieces.map((p, k) => (
            <span
              key={k}
              style={{
                ...box,
                borderColor: m.key === 'token' ? accent : C.border,
                color: m.key === 'token' ? accent : C.ink,
              }}
            >
              {p.replace(/ /g, '·')}
            </span>
          ))}
          {(m.extra || []).map((p, k) => (
            <span key={`x${k}`} style={{ ...box, borderStyle: 'dashed' }}>
              {p.replace(/ /g, '·')}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 8, minHeight: 30 }}>{m.note}</div>
      </div>

      {/* the catch, only for tokens */}
      <div
        style={{
          margin: '14px 0 0',
          padding: '12px 16px',
          borderTop: `1px solid ${C.border}`,
          background: dark ? '#0a0f0d' : '#f7f9f8',
        }}
      >
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
          now someone searches for <code style={{ fontFamily: MONO, color: C.ink }}>{QUERY}</code>
        </div>
        {m.key === 'isbpe' ? (
          <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.65 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.muted, width: 78 }}>in the query</span>
              <span style={{ ...box, borderColor: accent, color: accent }}>get</span>
              <span style={{ ...box }}>#_#</span>
              <span style={{ ...box, borderColor: accent, color: accent }}>user</span>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: 11, color: C.muted, width: 78 }}>in the line</span>
              <span style={{ ...box, borderColor: accent, color: accent }}>get</span>
              <span style={{ ...box }}>#_#</span>
              <span style={{ ...box, borderColor: accent, color: accent }}>user</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
              The same pieces both times. It holds after a dot and after an underscore too:{' '}
              <code style={{ fontFamily: MONO }}>self.get_user(</code> and{' '}
              <code style={{ fontFamily: MONO }}>_get_user(</code> both still contain{' '}
              <code style={{ fontFamily: MONO }}>get</code> and{' '}
              <code style={{ fontFamily: MONO }}>user</code>, where BPE gives three different
              pieces.
            </div>
          </div>
        ) : m.key === 'token' ? (
          <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.65 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.muted, width: 78 }}>in the query</span>
              <span style={{ ...box, borderColor: P.bad, color: P.bad }}>get</span>
              <span style={{ ...box, borderColor: accent, color: accent }}>_user</span>
            </div>
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 4,
                alignItems: 'center',
                marginTop: 4,
              }}
            >
              <span style={{ fontSize: 11, color: C.muted, width: 78 }}>in the line</span>
              <span style={{ ...box, borderColor: P.bad, color: P.bad }}>·get</span>
              <span style={{ ...box, borderColor: accent, color: accent }}>_user</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
              The first piece does not match. <code style={{ fontFamily: MONO }}>get</code> and{' '}
              <code style={{ fontFamily: MONO }}>·get</code> are different tokens, because BPE is
              space sensitive. That is why this method also records{' '}
              <strong style={{ color: C.ink }}>which pieces sit next to each other</strong>. Without
              that, the search misses the line.
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: C.ink, lineHeight: 1.65 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: C.muted, width: 78 }}>look up</span>
              {['get', 'et_', 't_u', '_us', 'use', 'ser'].map((p) => (
                <span key={p} style={box}>
                  {p}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>
              Chop the query the same way, look up each piece, keep the documents that hold all of
              them. Whatever survives gets the real regex run on it.
            </div>
          </div>
        )}
      </div>
    </figure>
  )
}

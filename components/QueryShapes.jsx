import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

import { chartChrome, vizPalette } from '../lib/viz-palette'

// A filter can only use fixed text. A pattern that pins down no text of three
// characters or more forces a full scan under every method, TopK's included.
// Whether that is rare or common turns out to depend entirely on WHO wrote the
// pattern, which is the point this component exists to make.
//
// Every pattern below is real: the agent column is mined from published
// OpenHands and SWE-agent trajectories, the human column from re.compile calls
// in CodeSearchNet. See experiments/regex-filter/mine_agent_queries.py.

const AGENT = [
  { p: 'GetEdk2RelativePathFromAbsolutePath', lit: 'GetEdk2RelativePathFromAbsolutePath' },
  { p: 'mCurrentFocus|mFocusedApp', lit: 'mCurrentFocus / mFocusedApp' },
  { p: 'default_parameter_values', lit: 'default_parameter_values' },
  { p: 'class Barrier|class WireCut', lit: 'class Barrier / class WireCut' },
  { p: '^PACKAGE =', lit: 'PACKAGE =' },
  { p: 'duckdb|DuckDB', lit: 'duckdb / DuckDB' },
  { p: 'def matrix', lit: 'def matrix' },
  { p: 'multipart', lit: 'multipart' },
  { p: 'test', lit: 'test' },
  { p: '\\\\"', lit: null },
]

const HUMAN = [
  { p: '\\s+', lit: null },
  { p: '\\d+', lit: null },
  { p: '[-/]', lit: null },
  { p: '(.)([A-Z][a-z]+)', lit: null },
  { p: '>(.+)<', lit: null },
  { p: '[A-Z][^A-Z]*', lit: null },
  { p: '[^0-9]', lit: null },
  { p: 'https?://', lit: 'http, ://' },
  { p: 'tower[0-9]+/', lit: 'tower' },
  { p: '__version__ = ', lit: '__version__ = ' },
]

const STATS = [
  { label: 'written by agents', sub: 'grep calls in 2,400 trajectories', pct: 96.3, n: 1079 },
  { label: 'written by humans', sub: 're.compile calls in source', pct: 48.2, n: 2998 },
]

const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'

export default function QueryShapes() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark'
  const C = chartChrome(dark)
  const P = vizPalette(dark)
  const [who, setWho] = useState(0)

  const rows = who === 0 ? AGENT : HUMAN
  const stat = STATS[who]

  return (
    <figure
      style={{
        margin: '2rem 0',
        border: `1px solid ${C.border}`,
        borderRadius: 3,
        background: C.card,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
          A filter can only use fixed text
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
          Patterns that describe only a shape force a full scan under every method. Who wrote the
          pattern decides how often that happens.
        </div>
      </div>

      <div style={{ display: 'flex', padding: '10px 16px 0' }}>
        {STATS.map((s, k) => (
          <button
            key={s.label}
            onClick={() => setWho(k)}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              padding: '5px 10px',
              cursor: 'pointer',
              border: `1px solid ${C.border}`,
              borderRight: k === 1 ? `1px solid ${C.border}` : 'none',
              background: k === who ? (k === 0 ? P.series0 : C.ink) : 'transparent',
              color: k === who ? C.card : C.muted,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 26,
              fontWeight: 600,
              color: who === 0 ? P.series0 : P.muted,
            }}
          >
            {stat.pct}%
          </span>
          <span style={{ fontSize: 12, color: C.muted }}>
            usable by a filter, of {stat.n.toLocaleString()} real patterns
          </span>
        </div>
        <div
          style={{
            height: 8,
            background: dark ? '#141922' : '#eef1f6',
            borderRadius: 1,
            overflow: 'hidden',
            marginBottom: 12,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${stat.pct}%`,
              background: who === 0 ? P.series0 : P.muted,
              transition: 'width .35s ease',
            }}
          />
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>{stat.sub}</div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>
        {rows.map((r) => (
          <div
            key={r.p}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '4px 0',
              borderTop: `1px solid ${C.grid}`,
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: C.ink,
                flex: '0 0 auto',
                minWidth: 0,
                maxWidth: '55%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {r.p}
            </span>
            <span style={{ flex: 1 }} />
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: r.lit ? P.series0 : P.muted,
                textAlign: 'right',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '45%',
              }}
            >
              {r.lit ? r.lit : 'no fixed text, must scan everything'}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          padding: '10px 16px',
          borderTop: `1px solid ${C.border}`,
          background: dark ? '#0a0f0d' : '#f7f9f8',
          fontSize: 11,
          color: C.muted,
          lineHeight: 1.65,
        }}
      >
        These ten rows are examples rather than a proportional sample. Agents search for
        identifiers. People writing <code style={{ fontFamily: MONO }}>re.compile</code> in source
        are describing shapes, and those patterns are string-processing utilities rather than
        searches. Nobody greps a repo for <code style={{ fontFamily: MONO }}>\s+</code>. Swapping
        one query set for the other moves the measured speedup over a full scan from 2.1x to 11.4x.
      </div>
    </figure>
  )
}

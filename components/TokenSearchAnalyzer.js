import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

// Two-path analyzer race: the OLD way (a per-language pipeline that must be
// swapped out for every language) vs TOKEN-NATIVE (one BPE tokenizer for all
// languages). Cycles English / Chinese / Hindi so you can watch the top lane
// reconfigure its boxes each time while the bottom lane never changes.

const LANGS = [
  {
    code: 'EN',
    name: 'English',
    text: 'the running foxes',
    old: { boxes: ['lowercase', 'stopwords', 'Porter stem'], out: ['run', 'fox'] },
    tok: ['␣the', '␣running', '␣foxes'],
    score: { old: 0.545, new: 0.547 },
    verdict: 'match',
    note: 'a stemmed English analyzer — matched, with none of its machinery',
  },
  {
    code: '中文',
    name: 'Chinese',
    text: '搜索引擎', // "search engine" — no spaces
    old: { boxes: ['jieba dictionary'], out: ['搜索', '引擎'] },
    tok: ['搜', '索', '引', '擎'],
    score: { old: 0.4, new: 0.53 },
    verdict: 'tokens win',
    note: '\\w+ collapses to one useless term — you need a segmenter; tokens just work',
  },
  {
    code: 'हिन्दी',
    name: 'Hindi',
    text: 'खोज इंजन', // "search engine"
    old: { boxes: ['\\w+ split', '(no stemmer)'], out: ['खोज', 'इंजन'] },
    tok: ['खो', 'ज', 'इं', 'जन'],
    score: { old: 0.39, new: 0.55 },
    verdict: 'tokens win',
    note: 'Devanagari inflection is lost on a word split; BPE shares subwords across variants',
  },
]

export default function TokenSearchAnalyzer() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted && resolvedTheme === 'dark' // avoid SSR/client hydration mismatch
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const ref = useRef(null)

  // auto-advance through languages unless hovered/focused
  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setI((x) => (x + 1) % LANGS.length), 4200)
    return () => clearInterval(t)
  }, [paused])

  const L = LANGS[i]
  const c = {
    bg: dark ? '#0f172a' : '#ffffff',
    panel: dark ? '#111827' : '#f8fafc',
    line: dark ? '#334155' : '#e2e8f0',
    text: dark ? '#e2e8f0' : '#0f172a',
    dim: dark ? '#94a3b8' : '#64748b',
    gray: '#94a3b8',
    green: '#10b981',
    greenBg: dark ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.10)',
    grayBg: dark ? 'rgba(148,163,184,0.14)' : 'rgba(148,163,184,0.12)',
    red: '#f87171',
    redBg: dark ? 'rgba(248,113,113,0.14)' : 'rgba(248,113,113,0.10)',
  }
  const tie = L.verdict === 'match'

  const chip = (bg, fg, brd) => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: '3px 9px',
    borderRadius: 7,
    fontSize: 13,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    background: bg,
    color: fg,
    border: `1px solid ${brd}`,
    whiteSpace: 'nowrap',
  })
  const box = (fg, bg) => ({
    padding: '6px 11px',
    borderRadius: 9,
    fontSize: 12.5,
    fontWeight: 600,
    background: bg,
    color: fg,
    border: `1px solid ${fg}`,
    whiteSpace: 'nowrap',
  })
  const arrow = { color: c.dim, fontSize: 15, flex: '0 0 auto' }

  return (
    <div
      ref={ref}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        background: c.bg,
        border: `1px solid ${c.line}`,
        borderRadius: 14,
        padding: '18px 18px 16px',
        margin: '8px 0',
        color: c.text,
        fontFamily:
          'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", "Noto Sans SC", sans-serif',
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .tsa-flow > * { animation: tsaIn .5s ease both; }
        @keyframes tsaIn { from { opacity:0; transform: translateX(-8px) } to { opacity:1; transform:none } }
        @keyframes tsaSwap { 0%{ box-shadow:0 0 0 0 ${c.red} } 40%{ box-shadow:0 0 0 3px ${c.redBg} } 100%{ box-shadow:0 0 0 0 transparent } }
        .tsa-swap { animation: tsaSwap .9s ease both; }
        .tsa-tabs button { transition: all .15s ease; }
        .tsa-lane { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
        @media (max-width: 640px) {
          .tsa-lane { gap:7px; }
          .tsa-hide-sm { display:none !important; }
        }
      `,
        }}
      />

      {/* header: language tabs + the shared input */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <div className="tsa-tabs" style={{ display: 'flex', gap: 6 }}>
          {LANGS.map((l, k) => (
            <button
              key={l.code}
              onClick={() => setI(k)}
              style={{
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: k === i ? 700 : 500,
                cursor: 'pointer',
                background: k === i ? c.green : 'transparent',
                color: k === i ? '#fff' : c.dim,
                border: `1px solid ${k === i ? c.green : c.line}`,
              }}
            >
              {l.code}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 12, color: c.dim }}>input</span>
          <span style={chip(c.panel, c.text, c.line)} lang={L.code === 'EN' ? 'en' : undefined}>
            {L.text}
          </span>
        </div>
      </div>

      {/* OLD lane */}
      <div
        style={{
          background: c.panel,
          border: `1px solid ${c.line}`,
          borderRadius: 11,
          padding: '11px 13px',
          marginBottom: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 9,
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 600, color: c.dim }}>
            The old way — a per-language pipeline
          </span>
          <span style={{ fontSize: 11, color: c.red, fontWeight: 600 }}>swaps per language ⟳</span>
        </div>
        <div className="tsa-lane tsa-flow" key={`old-${i}`}>
          <span style={chip(c.grayBg, c.text, c.gray)}>{L.text}</span>
          <span style={arrow}>→</span>
          {L.old.boxes.map((b, k) => (
            <span key={b} className="tsa-swap" style={box(c.gray, c.grayBg)}>
              {b}
              {k < L.old.boxes.length - 1 && <span style={{ color: c.dim, marginLeft: 7 }}>›</span>}
            </span>
          ))}
          <span style={arrow}>→</span>
          {L.old.out.map((w) => (
            <span key={w} style={chip(c.grayBg, c.text, c.gray)}>
              {w}
            </span>
          ))}
          <span style={arrow}>→</span>
          <span style={{ ...chip(c.grayBg, c.dim, c.gray), fontWeight: 700 }}>
            🔍 {L.score.old.toFixed(2)}
          </span>
        </div>
      </div>

      {/* TOKEN-NATIVE lane */}
      <div
        style={{
          background: c.greenBg,
          border: `1px solid ${c.green}`,
          borderRadius: 11,
          padding: '11px 13px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 9,
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 700, color: c.green }}>
            Token-native — one tokenizer, every language
          </span>
          <span style={{ fontSize: 11, color: c.green, fontWeight: 600 }}>same box ✓</span>
        </div>
        <div className="tsa-lane tsa-flow" key={`new-${i}`}>
          <span style={chip(dark ? '#0f172a' : '#fff', c.text, c.green)}>{L.text}</span>
          <span style={arrow}>→</span>
          <span style={box(c.green, dark ? '#0f172a' : '#fff')}>BPE tokenizer · o200k</span>
          <span style={arrow}>→</span>
          {L.tok.map((t, k) => (
            <span key={k} style={chip(dark ? '#0f172a' : '#fff', c.green, c.green)}>
              {t}
            </span>
          ))}
          <span style={arrow}>→</span>
          <span style={{ ...chip(dark ? '#0f172a' : '#fff', c.green, c.green), fontWeight: 700 }}>
            🔍 {L.score.new.toFixed(2)}
          </span>
        </div>
      </div>

      {/* punchline */}
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            background: tie ? c.grayBg : c.greenBg,
            color: tie ? c.dim : c.green,
            border: `1px solid ${tie ? c.gray : c.green}`,
          }}
        >
          {tie
            ? `NDCG@10 ${L.score.old.toFixed(2)} ≈ ${L.score.new.toFixed(2)} · tie`
            : `NDCG@10 ${L.score.new.toFixed(2)} vs ${L.score.old.toFixed(2)} · tokens win`}
        </span>
        <span style={{ fontSize: 12.5, color: c.dim }}>{L.note}</span>
      </div>
    </div>
  )
}

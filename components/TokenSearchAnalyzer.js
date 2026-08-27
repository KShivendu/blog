import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'

// Two-path analyzer race: the OLD way (a per-language pipeline that must be
// swapped out for every language) vs TOKEN-NATIVE (one BPE tokenizer for all
// languages). Cycles English / Chinese / Hindi so you can watch the top lane
// reconfigure its boxes each time while the bottom lane never changes.
//
// Visual language is deliberately borrowed from the blog's chart components
// (BarChart / LineChart) and the token-storage heroes (TokenCompressionPipeline):
// the Teletype warm-grey palette, Fira Code mono, ~2px squared corners, hairline
// borders, segmented (not pill) toggles, and the theme-aware brand green used as
// the single accent. Baseline = neutral grey; the winner = green.

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

// Fira Code first (site --font-mono), with Noto fallbacks so CJK / Devanagari
// glyphs render even though Fira Code has no coverage for them.
const MONO = 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
const TEXT = `${MONO}, "Noto Sans Devanagari", "Noto Sans SC", sans-serif`

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

  // Palette mirrors LineChart's palette(isDark) so the widget reads as a sibling
  // of the site's native charts. Accent = the theme-aware brand green.
  const c = dark
    ? {
        card: '#0d1310',
        border: '#1e2822',
        ink: '#dde6e0',
        muted: '#8a968e',
        axis: '#38473e',
        accent: '#34d399',
        accentInk: '#08110c',
        neutralFill: 'rgba(255,255,255,0.04)',
        tokFill: 'rgba(52,211,153,0.12)',
        tokText: '#6ee7b7',
        churn: '#f0a3a3',
        laneBg: 'rgba(255,255,255,0.015)',
      }
    : {
        card: '#ffffff',
        border: '#e0e4e1',
        ink: '#14161a',
        muted: '#5f6570',
        axis: '#c8cfc9',
        accent: '#047857',
        accentInk: '#ffffff',
        neutralFill: '#f0f2f0',
        tokFill: 'rgba(4,120,87,0.09)',
        tokText: '#065f46',
        churn: '#c2410c',
        laneBg: '#fbfcfb',
      }
  const tie = L.verdict === 'match'

  // A pipeline stage in the OLD lane — neutral grey, hairline border.
  const stage = {
    padding: '5px 10px',
    borderRadius: 2,
    fontSize: 12,
    fontWeight: 600,
    background: c.neutralFill,
    color: c.muted,
    border: `1px solid ${c.axis}`,
    whiteSpace: 'nowrap',
    fontFamily: MONO,
  }
  // A term / token chip. `win` → the green token-native treatment.
  const chip = (win) => ({
    padding: '4px 9px',
    borderRadius: 2,
    fontSize: 12.5,
    background: win ? c.tokFill : c.neutralFill,
    color: win ? c.tokText : c.ink,
    border: `1px solid ${win ? c.accent : c.axis}`,
    whiteSpace: 'nowrap',
    fontFamily: TEXT,
  })
  const score = (win) => ({
    display: 'inline-flex',
    alignItems: 'baseline',
    gap: 5,
    padding: '4px 9px',
    borderRadius: 2,
    fontSize: 13,
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    background: win ? c.tokFill : c.neutralFill,
    color: win ? c.tokText : c.muted,
    border: `1px solid ${win ? c.accent : c.axis}`,
    whiteSpace: 'nowrap',
    fontFamily: MONO,
  })
  const arrow = { color: c.axis, fontSize: 13, flex: '0 0 auto', userSelect: 'none' }
  const laneLabel = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    fontFamily: MONO,
  }

  const scoreTag = () => (
    <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', opacity: 0.7 }}>
      NDCG
    </span>
  )

  return (
    <div
      ref={ref}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        background: c.card,
        border: `1px solid ${c.border}`,
        borderRadius: 2,
        padding: 'clamp(12px, 3vw, 16px)',
        margin: '1.5rem 0',
        color: c.ink,
        fontFamily: MONO,
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .tsa-flow > * { animation: tsaIn .45s ease both; }
        @keyframes tsaIn { from { opacity:0; transform: translateX(-6px) } to { opacity:1; transform:none } }
        .tsa-lane { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .tsa-sep { color:${c.axis}; opacity:.8; margin:0 -2px; }
        @media (max-width: 600px) {
          .tsa-lane { gap:6px 7px; }
          .tsa-sep { display:none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .tsa-flow > * { animation: none !important; }
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
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'flex' }}>
          {LANGS.map((l, k) => {
            const on = k === i
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => setI(k)}
                aria-pressed={on}
                title={l.name}
                style={{
                  appearance: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  lineHeight: 1,
                  padding: '6px 12px',
                  border: `1px solid ${on ? c.accent : c.border}`,
                  marginLeft: k === 0 ? 0 : '-1px',
                  background: on ? c.accent : 'transparent',
                  color: on ? c.accentInk : c.muted,
                  fontFamily: TEXT,
                  fontWeight: on ? 600 : 400,
                  zIndex: on ? 1 : 0,
                  position: 'relative',
                  borderRadius: 2,
                  transition: 'background .15s, color .15s, border-color .15s',
                }}
              >
                {l.code}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              color: c.muted,
            }}
          >
            input
          </span>
          <span style={chip(false)} lang={L.code === 'EN' ? 'en' : undefined}>
            {L.text}
          </span>
        </div>
      </div>

      {/* OLD lane */}
      <div
        style={{
          background: c.laneBg,
          border: `1px solid ${c.border}`,
          borderRadius: 2,
          padding: '10px 12px',
          marginBottom: 8,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ ...laneLabel, color: c.muted }}>The old way · per-language pipeline</span>
          <span style={{ ...laneLabel, color: c.churn, letterSpacing: '0.03em' }}>
            swaps per language
          </span>
        </div>
        <div className="tsa-lane tsa-flow" key={`old-${i}`}>
          <span style={chip(false)}>{L.text}</span>
          <span style={arrow}>→</span>
          {L.old.boxes.map((b, k) => (
            <span key={b} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={stage}>{b}</span>
              {k < L.old.boxes.length - 1 && <span className="tsa-sep">›</span>}
            </span>
          ))}
          <span style={arrow}>→</span>
          {L.old.out.map((w) => (
            <span key={w} style={chip(false)}>
              {w}
            </span>
          ))}
          <span style={arrow}>→</span>
          <span style={score(false)}>
            {scoreTag()}
            {L.score.old.toFixed(2)}
          </span>
        </div>
      </div>

      {/* TOKEN-NATIVE lane */}
      <div
        style={{
          background: c.tokFill,
          border: `1px solid ${c.accent}`,
          borderRadius: 2,
          padding: '10px 12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ ...laneLabel, color: c.accent }}>Token-native · one tokenizer</span>
          <span style={{ ...laneLabel, color: c.accent, letterSpacing: '0.03em' }}>
            same box, every language
          </span>
        </div>
        <div className="tsa-lane tsa-flow" key={`new-${i}`}>
          <span style={chip(false)}>{L.text}</span>
          <span style={arrow}>→</span>
          <span
            style={{
              ...stage,
              color: c.tokText,
              background: c.tokFill,
              border: `1px solid ${c.accent}`,
              fontWeight: 700,
            }}
          >
            BPE · o200k
          </span>
          <span style={arrow}>→</span>
          {L.tok.map((t, k) => (
            <span key={k} style={chip(true)}>
              {t}
            </span>
          ))}
          <span style={arrow}>→</span>
          <span style={score(true)}>
            {scoreTag()}
            {L.score.new.toFixed(2)}
          </span>
        </div>
      </div>

      {/* punchline */}
      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            padding: '4px 9px',
            borderRadius: 2,
            fontSize: 11.5,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            fontFamily: MONO,
            background: tie ? c.neutralFill : c.tokFill,
            color: tie ? c.muted : c.tokText,
            border: `1px solid ${tie ? c.axis : c.accent}`,
            whiteSpace: 'nowrap',
          }}
        >
          {tie
            ? `NDCG@10  ${L.score.old.toFixed(2)} ≈ ${L.score.new.toFixed(2)}  ·  tie`
            : `NDCG@10  ${L.score.new.toFixed(2)} vs ${L.score.old.toFixed(2)}  ·  tokens win`}
        </span>
        <span style={{ fontSize: 12.5, color: c.muted, fontFamily: TEXT, lineHeight: 1.45 }}>
          {L.note}
        </span>
      </div>
    </div>
  )
}

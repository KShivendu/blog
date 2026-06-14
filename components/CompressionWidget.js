import { useState, useRef, useEffect, useCallback } from 'react'
import { gzipSync } from 'fflate'
import { useTheme } from 'next-themes'

const EXAMPLES = [
  {
    label: 'RAG doc',
    text: `Retrieval-Augmented Generation (RAG) is a technique that combines large language models with external knowledge retrieval. Instead of relying solely on parametric memory encoded in model weights, RAG systems retrieve relevant documents from a knowledge base at inference time and condition the model's response on that retrieved context.

Vector databases like Qdrant store dense embeddings of documents alongside the raw text payload, enabling fast approximate nearest-neighbor search over billions of vectors. The raw text is stored verbatim so it can be returned to the model as context after retrieval.`,
  },
  {
    label: 'Wikipedia',
    text: `The Eiffel Tower is a wrought-iron lattice tower on the Champ de Mars in Paris, France. It is named after the engineer Gustave Eiffel, whose company designed and built the tower from 1887 to 1889 as the centerpiece of the 1889 World's Fair, which celebrated the centennial of the French Revolution.

The tower is 330 metres tall, about the same height as an 81-storey building, and the tallest structure in Paris. Its base is square, measuring 125 metres on each side. During its construction, the Eiffel Tower surpassed the Washington Monument to become the world's tallest man-made structure, a title it held for 41 years until the Chrysler Building in New York City was finished in 1930.`,
  },
  {
    label: 'Python code',
    text: `def compress(text: str, model: CategoricalModel) -> bytes:
    enc = tiktoken.get_encoding("r50k_base")
    ids = enc.encode(text)
    coder = constriction.stream.stack.AnsCoder()
    coder.encode_reverse(np.array(ids, dtype=np.int32), model)
    return len(ids).to_bytes(4, 'big') + coder.get_compressed().tobytes()

def decompress(data: bytes, model: CategoricalModel) -> str:
    enc = tiktoken.get_encoding("r50k_base")
    n = int.from_bytes(data[:4], 'big')
    buf = np.frombuffer(data[4:], dtype=np.uint32).copy()
    ids = constriction.stream.stack.AnsCoder(buf).decode(model, n).tolist()
    return enc.decode(ids)`,
  },
]

// ── pure JS BPE (no WASM) ─────────────────────────────────────────────────────

async function loadRanks(ranksUrl) {
  const buf = await fetch(ranksUrl).then((r) => r.arrayBuffer())
  // eslint-disable-next-line no-undef
  const ds = new DecompressionStream('gzip')
  const w = ds.writable.getWriter()
  w.write(new Uint8Array(buf))
  w.close()
  const reader = ds.readable.getReader()
  const chunks = []
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const text = new TextDecoder().decode(
    chunks.reduce((a, b) => {
      const out = new Uint8Array(a.length + b.length)
      out.set(a)
      out.set(b, a.length)
      return out
    }, new Uint8Array(0))
  )
  const bytesToRank = new Map()
  const rankToBytes = []
  for (const line of text.split('\n')) {
    if (!line) continue
    const tab = line.indexOf('\t')
    const rank = parseInt(line.slice(tab + 1), 10)
    const bytes = atob(line.slice(0, tab))
    bytesToRank.set(bytes, rank)
    rankToBytes[rank] = bytes
  }
  return { bytesToRank, rankToBytes }
}

function bpeEncode(text, bytesToRank, rankToBytes) {
  const utf8 = new TextEncoder().encode(text)
  const tokens = []
  for (const b of utf8) {
    const rank = bytesToRank.get(String.fromCharCode(b))
    if (rank !== undefined) tokens.push(rank)
  }
  while (tokens.length > 1) {
    let minRank = Infinity
    let minIdx = -1
    for (let i = 0; i < tokens.length - 1; i++) {
      const rank = bytesToRank.get(rankToBytes[tokens[i]] + rankToBytes[tokens[i + 1]])
      if (rank !== undefined && rank < minRank) {
        minRank = rank
        minIdx = i
      }
    }
    if (minIdx === -1) break
    tokens.splice(minIdx, 1, minRank)
    tokens.splice(minIdx + 1, 1)
  }
  return tokens
}

// ── ui helpers ────────────────────────────────────────────────────────────────

function Bar({ pct, winner }) {
  return (
    <div
      style={{
        height: 6,
        width: `${pct}%`,
        minWidth: 3,
        background: winner ? '#10b981' : '#cbd5e1',
        borderRadius: 3,
        transition: 'width 0.3s ease',
      }}
    />
  )
}

// ── main component ────────────────────────────────────────────────────────────

export default function CompressionWidget() {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark'

  const [open, setOpen] = useState(false)
  const [activeExample, setActiveExample] = useState(0)
  const [text, setText] = useState(EXAMPLES[0].text)
  const [status, setStatus] = useState('idle')
  const [results, setResults] = useState(null)
  const ranksRef = useRef(null)
  const probsRef = useRef(null)

  const bg = dark ? '#1e293b' : '#ffffff'
  const border = dark ? '#334155' : '#e2e8f0'
  const headerBg = dark ? '#0f172a' : '#f8fafc'
  const textMain = dark ? '#e2e8f0' : '#1e293b'
  const textMuted = dark ? '#94a3b8' : '#64748b'
  const textDim = dark ? '#64748b' : '#94a3b8'
  const inputBg = dark ? '#0f172a' : '#f8fafc'
  const inputBorder = dark ? '#334155' : '#e2e8f0'
  const rowBorder = dark ? '#1e293b' : '#f8fafc'
  const pillBg = dark ? '#1e293b' : '#f1f5f9'
  const pillActiveBg = dark ? '#0f172a' : '#1e293b'
  const pillActiveText = '#ffffff'
  const pillText = dark ? '#94a3b8' : '#64748b'

  const measure = useCallback((t) => {
    if (!ranksRef.current || !probsRef.current) return
    const raw = new TextEncoder().encode(t)
    if (raw.length === 0) {
      setResults(null)
      return
    }
    const gz = gzipSync(raw, { level: 9 })
    const { bytesToRank, rankToBytes } = ranksRef.current
    const ids = bpeEncode(t, bytesToRank, rankToBytes)
    const tokenRaw = ids.length * 2
    const probs = probsRef.current
    let bits = 0
    for (const id of ids) {
      const p = probs[id]
      if (p > 0) bits += -Math.log2(p)
    }
    const ansBytes = Math.ceil(bits / 8)
    setResults({ rawLen: raw.length, gz: gz.length, tokenRaw, ans: ansBytes, tokens: ids.length })
  }, [])

  useEffect(() => {
    if (status === 'ready') measure(text)
  }, [text, status, measure])

  async function boot() {
    if (status !== 'idle') return
    setStatus('loading')
    try {
      const [ranks, probBuf] = await Promise.all([
        loadRanks('/static/r50k_ranks.bin'),
        fetch('/static/r50k_probs.bin').then((r) => r.arrayBuffer()),
      ])
      ranksRef.current = ranks
      probsRef.current = new Float32Array(probBuf)
      setStatus('ready')
    } catch (e) {
      console.error(e)
      setStatus('error')
    }
  }

  function handleOpen() {
    setOpen(true)
    boot()
  }

  function selectExample(i) {
    setActiveExample(i)
    setText(EXAMPLES[i].text)
  }

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 18px',
          borderRadius: 10,
          border: `1.5px dashed ${dark ? '#475569' : '#cbd5e1'}`,
          background: 'transparent',
          cursor: 'pointer',
          fontSize: 14,
          color: textMuted,
          margin: '1.5rem 0',
          width: '100%',
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{ fontSize: 18 }}>⌨</span>
        <span>Try it yourself — paste any text and see live compression ratios</span>
        <span style={{ marginLeft: 'auto', opacity: 0.5 }}>▸</span>
      </button>
    )
  }

  const rows = results
    ? [
        { label: 'Raw UTF-8', bytes: results.rawLen, note: null, baseline: true },
        { label: 'gzip -9', bytes: results.gz, note: null },
        {
          label: 'r50k uint16',
          bytes: results.tokenRaw,
          note: `${results.tokens} tokens`,
        },
        { label: 'r50k + ANS', bytes: results.ans, note: 'entropy est.' },
      ]
    : []

  const best = results ? Math.min(results.gz, results.tokenRaw, results.ans) : 1
  const rawLen = results?.rawLen ?? 1

  return (
    <div
      style={{
        margin: '1.5rem 0',
        borderRadius: 12,
        border: `1px solid ${border}`,
        overflow: 'hidden',
        fontFamily: 'Inter, ui-sans-serif, sans-serif',
        background: bg,
      }}
    >
      {/* header */}
      <div
        style={{
          padding: '12px 16px',
          background: headerBg,
          borderBottom: `1px solid ${border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <span style={{ fontWeight: 700, fontSize: 13, color: textMain }}>
            Live compression calculator
          </span>
          <span style={{ fontSize: 11, color: textDim, marginLeft: 8 }}>
            r50k BPE · gzip · ANS (entropy estimate)
          </span>
        </div>
        {results && (
          <span
            style={{
              fontSize: 11,
              color: textDim,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {results.rawLen.toLocaleString()} bytes in
          </span>
        )}
      </div>

      <div style={{ padding: 16 }}>
        {/* example pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.label}
              onClick={() => selectExample(i)}
              style={{
                padding: '4px 10px',
                borderRadius: 20,
                border: 'none',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                background: activeExample === i ? pillActiveBg : pillBg,
                color: activeExample === i ? pillActiveText : pillText,
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {ex.label}
            </button>
          ))}
          <span style={{ fontSize: 12, color: textDim, alignSelf: 'center', marginLeft: 4 }}>
            or paste your own ↓
          </span>
        </div>

        {/* textarea */}
        <textarea
          value={text}
          onChange={(e) => {
            setActiveExample(-1)
            setText(e.target.value)
          }}
          rows={5}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            padding: '10px 12px',
            fontSize: 12,
            fontFamily: 'ui-monospace, monospace',
            borderRadius: 8,
            border: `1px solid ${inputBorder}`,
            resize: 'vertical',
            background: inputBg,
            color: textMain,
            outline: 'none',
            lineHeight: 1.6,
          }}
          placeholder="Paste any text here..."
        />

        {/* status */}
        {status === 'loading' && (
          <p style={{ fontSize: 12, color: textDim, marginTop: 12, marginBottom: 0 }}>
            Loading tokenizer (~550 KB)...
          </p>
        )}
        {status === 'error' && (
          <p style={{ fontSize: 12, color: '#ef4444', marginTop: 12, marginBottom: 0 }}>
            Failed to load. Check your connection and reload.
          </p>
        )}

        {/* results table */}
        {status === 'ready' && results && (
          <div style={{ marginTop: 16 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: 'left',
                      paddingBottom: 8,
                      fontWeight: 600,
                      fontSize: 11,
                      color: textDim,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Method
                  </th>
                  <th
                    style={{
                      textAlign: 'right',
                      paddingBottom: 8,
                      fontWeight: 600,
                      fontSize: 11,
                      color: textDim,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Size
                  </th>
                  <th
                    style={{
                      textAlign: 'right',
                      paddingBottom: 8,
                      paddingRight: 16,
                      fontWeight: 600,
                      fontSize: 11,
                      color: textDim,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Ratio
                  </th>
                  <th style={{ width: '35%', paddingBottom: 8 }} />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ label, bytes, note, baseline }) => {
                  const winner = !baseline && bytes === best
                  const ratio = (rawLen / bytes).toFixed(2)
                  const barPct = Math.min(100, ((rawLen - bytes) / rawLen) * 100)
                  return (
                    <tr key={label} style={{ borderTop: `1px solid ${rowBorder}` }}>
                      <td
                        style={{
                          padding: '8px 0',
                          color: baseline ? textDim : textMain,
                          fontWeight: baseline ? 400 : 500,
                        }}
                      >
                        {label}
                        {note && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 11,
                              color: textDim,
                              fontWeight: 400,
                            }}
                          >
                            {note}
                          </span>
                        )}
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '8px 0',
                          color: textMuted,
                          fontSize: 12,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {bytes.toLocaleString()} B
                      </td>
                      <td
                        style={{
                          textAlign: 'right',
                          padding: '8px 0',
                          paddingRight: 16,
                          fontWeight: 700,
                          fontSize: 14,
                          color: winner ? '#10b981' : baseline ? textDim : textMuted,
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {baseline ? '1.00×' : `${ratio}×`}
                      </td>
                      <td style={{ padding: '8px 0' }}>
                        <Bar pct={baseline ? 0 : Math.max(barPct, 2)} winner={winner} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

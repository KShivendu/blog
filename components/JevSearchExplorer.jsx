import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { chartChrome, vizPalette } from '../lib/viz-palette'

const URL = '/static/data/jev-keyword-search-kl.json'
const COLLECTIONS = {
  DBPedia: 'Wikipedia abstracts',
  NQ: 'Wikipedia passages',
  FiQA: 'finance forum posts',
}

export default function JevSearchExplorer() {
  const { resolvedTheme } = useTheme()
  const [examples, setExamples] = useState([])
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    fetch(URL)
      .then((r) => {
        if (!r.ok) throw new Error('data')
        return r.json()
      })
      .then((data) => {
        if (active) setExamples(data.examples.filter((e) => e.dataset in COLLECTIONS))
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [])
  const dark = resolvedTheme === 'dark'
  const colors = chartChrome(dark)
  const palette = vizPalette(dark)
  const example = examples[selected]
  const terms = example ? example.words.filter((w) => !w.stop) : []
  const max = Math.max(...terms.map((w) => w.jevWeight), 1)
  const short = (text) => (text.length > 80 ? text.slice(0, 80).replace(/\s+\S*$/, '') + '…' : text)
  return (
    <section
      className="jev-example"
      aria-label="Compare BM25 and Jev on example queries"
      style={{
        '--jev-ink': colors.ink,
        '--jev-muted': colors.muted,
        '--jev-grid': colors.grid,
        '--jev-border': colors.border,
        '--jev-card': colors.card,
        '--jev-series': palette.series0,
        '--jev-baseline': palette.muted,
      }}
    >
      {!example ? (
        <p role="status">
          {error ? 'Could not load the example. Please reload.' : 'Loading the example…'}
        </p>
      ) : (
        <>
          <label className="jev-query" htmlFor="jev-example-query">
            Example query
          </label>
          <select
            id="jev-example-query"
            className="jev-query-select"
            value={selected}
            onChange={(event) => setSelected(Number(event.target.value))}
          >
            {examples.map((item, i) => (
              <option key={item.text} value={i}>
                {item.text}
              </option>
            ))}
          </select>
          <p className="jev-caption">
            Word weights: a matching word contributes more when its weight is higher.
          </p>
          <div className="jev-legend" aria-hidden="true">
            <span>
              <i style={{ background: 'var(--jev-baseline)' }} />
              BM25
            </span>
            <span>
              <i style={{ background: 'var(--jev-series)' }} />
              BM25 + Jev
            </span>
          </div>
          {terms.map((w) => (
            <div className="jev-word" key={w.word}>
              <span className="jev-word-label">{w.word}</span>
              {[
                ['BM25', w.idf, 'var(--jev-baseline)'],
                ['BM25 + Jev', w.jevWeight, 'var(--jev-series)'],
              ].map(([method, weight, color]) => (
                <div
                  className="jev-bar"
                  key={method}
                  aria-label={`${method}: ${weight.toFixed(2)}`}
                >
                  <span className="jev-track">
                    <span style={{ width: `${(100 * weight) / max}%`, background: color }} />
                  </span>
                  <span>{weight.toFixed(2)}</span>
                </div>
              ))}
            </div>
          ))}
          <div className="jev-answer">
            {[
              ['bm25', 'BM25'],
              ['jev', 'BM25 + Jev'],
            ].map(([mode, label]) => (
              <div key={mode}>
                <strong className={mode === 'jev' ? 'jev-rank' : undefined}>{label}: top 5</strong>
                <ol>
                  {example.rankings[mode].map((doc) => (
                    <li key={doc.id} className={doc.relevant ? 'jev-relevant' : undefined}>
                      {short(doc.text)}
                      {doc.relevant && <span aria-label="relevant"> ✓</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <p className="jev-caption">
            ✓ marks a relevant result. Top-10 quality (nDCG@10): {example.bm25.toFixed(2)} with
            BM25, {example.jev.toFixed(2)} with BM25 + Jev.
          </p>
          <p className="jev-caption">
            Searches {example.documents.toLocaleString()} {COLLECTIONS[example.dataset]}.
            {example.settings &&
              ` Each method uses its own tuned settings: k₁ = ${example.settings.bm25[0]}, b = ${example.settings.bm25[1]} for BM25 and k₁ = ${example.settings.jev[0]}, b = ${example.settings.jev[1]} for BM25 + Jev.`}
          </p>
        </>
      )}
      <style jsx global>{`
        .jev-formula {
          max-width: 100%;
          overflow-x: auto;
          padding: 4px 0;
        }
        .jev-formula .katex-display {
          width: max-content;
          min-width: 100%;
        }
        .jev-example {
          margin: 24px 0;
          padding: 20px;
          border: 1px solid var(--jev-border);
          background: var(--jev-card);
          color: var(--jev-ink);
          font-size: 15px;
          line-height: 1.6;
        }
        .jev-query {
          display: block;
          font-size: 13px;
          font-weight: 600;
        }
        .jev-query-select {
          appearance: auto;
          cursor: pointer;
          width: 100%;
          margin-top: 6px;
          border: 1px solid var(--jev-border);
          background: var(--jev-card);
          color: var(--jev-ink);
          font-size: 16px;
          padding: 8px;
        }
        .jev-query-select:focus-visible {
          outline: 2px solid var(--jev-series);
          outline-offset: 3px;
        }
        .jev-legend {
          display: flex;
          gap: 16px;
          margin: 10px 0;
          font-size: 13px;
        }
        .jev-legend span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .jev-legend i {
          display: inline-block;
          width: 12px;
          height: 12px;
        }
        .jev-caption {
          font-size: 13px;
          color: var(--jev-muted);
          margin: 10px 0;
        }
        .jev-word {
          display: grid;
          grid-template-columns: 78px 1fr;
          column-gap: 12px;
          row-gap: 3px;
          align-items: center;
          padding: 7px 0;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-variant-numeric: tabular-nums;
        }
        .jev-word-label {
          grid-row: span 2;
        }
        .jev-bar {
          display: grid;
          grid-template-columns: 1fr 45px;
          gap: 12px;
          align-items: center;
          font-size: 13px;
        }
        .jev-track {
          height: 12px;
          background: var(--jev-grid);
        }
        .jev-track > span {
          display: block;
          height: 100%;
          transition: width 180ms ease;
        }
        .jev-answer {
          margin-top: 18px;
          border-top: 1px solid var(--jev-border);
          padding-top: 14px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        .jev-rank {
          color: var(--jev-series);
        }
        .jev-answer ol {
          margin: 8px 0 0;
          padding-left: 20px;
          font-size: 14px;
        }
        .jev-answer li {
          margin: 4px 0;
          color: var(--jev-muted);
        }
        .jev-answer li.jev-relevant {
          color: var(--jev-ink);
          font-weight: 600;
        }
        @media (max-width: 540px) {
          .jev-example {
            padding: 12px;
          }
          .jev-answer {
            grid-template-columns: 1fr;
          }
          .jev-word {
            gap: 8px;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .jev-track > span {
            transition: none;
          }
        }
      `}</style>
    </section>
  )
}

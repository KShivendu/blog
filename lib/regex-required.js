// The text a regex guarantees, as an OR of AND-groups.
//
// `(user|role)_\w+ = ` becomes two branches, [user_, ' = '] and [role_, ' = ']:
// every match holds all the pieces of at least one branch. A filter may only
// require that much. Requiring more (say, the longest piece of one branch)
// would drop real matches, which a prefilter must never do.
//
// Each piece keeps the source positions of its characters so the widget can
// point at them inside the pattern.

const MAX_BRANCHES = 8
const BREAK_ESCAPES = 'wWsSdDbBAZzGpPkx0123456789'
const CHAR_ESCAPES = { n: '\n', t: '\t', r: '\r', f: '\f', v: '\v' }

// A branch is a list of segments. Segment boundaries are places where the regex
// allows anything (a class, a dot, an optional part), so text can't join across
// them. The first and last segments stay open, so they join whatever sits next
// to the branch in the pattern.
const lit = (c, p) => [{ segs: [[{ c, p }]] }]
const brk = () => [{ segs: [[], []] }]
const empty = () => [{ segs: [[]] }]

function concat(A, B) {
  const out = []
  for (const a of A) {
    for (const b of B) {
      const segs = [...a.segs.slice(0, -1), [...a.segs.at(-1), ...b.segs[0]], ...b.segs.slice(1)]
      out.push({ segs })
    }
  }
  // Too many branches: give up on this part and treat it as "anything". That
  // only makes the filter looser, never wrong.
  return out.length > MAX_BRANCHES ? brk() : out
}

function parse(src) {
  let i = 0

  function quantifier() {
    const c = src[i]
    if (c === '?' || c === '*') {
      i += 1
      if (src[i] === '?' || src[i] === '+') i += 1
      return 'optional'
    }
    if (c === '+') {
      i += 1
      if (src[i] === '?' || src[i] === '+') i += 1
      return 'repeat'
    }
    if (c === '{') {
      const m = /^\{(\d*)(,?)(\d*)\}/.exec(src.slice(i))
      if (!m) return null
      i += m[0].length
      if (src[i] === '?' || src[i] === '+') i += 1
      const lo = m[1] === '' ? 0 : Number(m[1])
      if (lo === 0) return 'optional'
      if (lo === 1 && !m[2] && (m[3] === '' || m[3] === '1')) return null
      return 'repeat'
    }
    return null
  }

  function atom() {
    const c = src[i]
    if (c === '(') {
      i += 1
      let look = false
      if (src[i] === '?') {
        // (?:...) groups, (?=...) and friends only look, (?<name>...) captures.
        if (src[i + 1] === ':') i += 2
        else if (src[i + 1] === '<' && src[i + 2] !== '=' && src[i + 2] !== '!') {
          i = src.indexOf('>', i) + 1
        } else {
          look = true
          i += src[i + 1] === '<' ? 3 : 2
        }
      }
      const inner = alternation()
      if (src[i] === ')') i += 1
      return look ? brk() : inner
    }
    if (c === '[') {
      let j = i + 1
      if (src[j] === '^') j += 1
      if (src[j] === ']') j += 1
      while (j < src.length && src[j] !== ']') j += src[j] === '\\' ? 2 : 1
      i = j + 1
      return brk()
    }
    if (c === '\\') {
      const e = src[i + 1]
      const p = i + 1
      i += 2
      if (e === undefined || BREAK_ESCAPES.includes(e)) return brk()
      if (CHAR_ESCAPES[e]) return lit(CHAR_ESCAPES[e], p)
      return lit(e, p)
    }
    if (c === '.' || c === '^' || c === '$') {
      i += 1
      return brk()
    }
    i += 1
    return lit(c, i - 1)
  }

  function sequence() {
    let acc = empty()
    while (i < src.length && src[i] !== '|' && src[i] !== ')') {
      const a = atom()
      const q = quantifier()
      if (q === 'optional') acc = concat(acc, brk())
      else if (q === 'repeat') acc = concat(concat(acc, a), brk())
      else acc = concat(acc, a)
    }
    return acc
  }

  function alternation() {
    let out = sequence()
    while (src[i] === '|') {
      i += 1
      out = out.concat(sequence())
    }
    if (out.length > MAX_BRANCHES) return brk()
    return out
  }

  const res = alternation()
  // A stray ')' would stop the parse early; the rest is unknown, so it can only
  // loosen the result.
  if (i < src.length) return concat(res, brk())
  return res
}

const MIN_PIECE = 3

// Branches as lists of pieces: { text, pos: [source index per character] }.
// A branch with no piece of three or more characters pins down nothing, so the
// whole pattern can't be filtered and `branches` comes back empty.
export function requiredText(pattern) {
  if (!pattern) return { branches: [], filterable: false }
  const raw = parse(pattern)
  const seen = new Set()
  const branches = []
  for (const b of raw) {
    const pieces = b.segs
      .filter((s) => s.length >= MIN_PIECE)
      .map((s) => ({ text: s.map((x) => x.c).join(''), pos: s.map((x) => x.p) }))
    if (!pieces.length) return { branches: [], filterable: false }
    // Order doesn't matter to a filter: user.*role and role.*user need the same text.
    const key = pieces
      .map((x) => x.text)
      .sort()
      .join('\u0000')
    if (seen.has(key)) continue
    seen.add(key)
    branches.push(pieces)
  }
  return { branches, filterable: branches.length > 0 }
}

export const chunksOf = (s) =>
  s.length < 3 ? [] : Array.from({ length: s.length - 2 }, (_, i) => s.slice(i, i + 3))

// Where a chunk sits in a file, from the tokenizer's cuts: 1 if some occurrence
// lies inside one token (the BM25 token lists answer it, through the
// vocabulary), 2 if every occurrence crosses a cut (only the boundary grams
// answer it), 0 if the file doesn't hold it.
export function whereIs(doc, g) {
  let i = doc.text.indexOf(g)
  if (i < 0) return 0
  const cuts = doc.cuts || []
  while (i >= 0) {
    const s = i
    if (!cuts.some((c) => c > s && c < s + g.length)) return 1
    i = doc.text.indexOf(g, i + 1)
  }
  return 2
}

// The token text around a chunk's first occurrence, with cuts shown as |.
export function tokenView(doc, g) {
  const i = doc.text.indexOf(g)
  if (i < 0) return null
  const cuts = [0, ...(doc.cuts || []), doc.text.length]
  let a = 0
  let b = doc.text.length
  for (const c of cuts) {
    if (c <= i) a = c
    if (c >= i + g.length) {
      b = c
      break
    }
  }
  let out = ''
  for (let k = a; k < b; k += 1) {
    if (k > a && cuts.includes(k)) out += '|'
    out += doc.text[k]
  }
  return out.replace(/ /g, '·').replace(/\n/g, '⏎')
}

// A file's tokens, from its cut offsets.
const tokCache = new WeakMap()
export function docTokens(doc) {
  if (tokCache.has(doc)) return tokCache.get(doc)
  const cuts = [0, ...(doc.cuts || []), doc.text.length]
  const toks = []
  for (let k = 0; k + 1 < cuts.length; k += 1) {
    if (cuts[k + 1] > cuts[k]) toks.push({ s: cuts[k], t: doc.text.slice(cuts[k], cuts[k + 1]) })
  }
  tokCache.set(doc, toks)
  return toks
}

// Does token t, holding the chunk at offset o, agree with the literal around
// it? The chunk starts at p in the literal. Bytes of t that fall outside the
// literal are free. This is "fitting": ` get` fits `def get_`, ` budget` doesn't.
function fits(t, o, lit, p) {
  for (let k = 0; k < t.length; k += 1) {
    const q = p - o + k
    if (q >= 0 && q < lit.length && t[k] !== lit[q]) return false
  }
  return true
}

// The posting lists one chunk really reads. No list is keyed by the chunk:
// the vocabulary names the tokens that hold it and fit, and their BM25 lists
// are fetched. Where the chunk falls on a token cut, the boundary gram (the
// same 3 bytes, stored only at cuts) is the key instead. A file passes the
// chunk if any of these lists holds it.
export function chunkLists(docs, lit, p, maxTokens = 3) {
  const g = lit.slice(p, p + 3)
  const byTok = new Map()
  docs.forEach((d, i) => {
    for (const { t } of docTokens(d)) {
      if (byTok.has(t) && byTok.get(t).has(i)) continue
      let o = t.indexOf(g)
      let ok = false
      while (o >= 0 && !ok) {
        ok = fits(t, o, lit, p)
        o = t.indexOf(g, o + 1)
      }
      if (!ok) continue
      if (!byTok.has(t)) byTok.set(t, new Set())
      byTok.get(t).add(i)
    }
  })
  const toks = [...byTok.entries()].sort((a, b) => b[1].size - a[1].size)
  const rows = toks.slice(0, maxTokens).map(([t, set]) => ({
    kind: 'token',
    key: t,
    hits: docs.map((_, i) => set.has(i)),
  }))
  if (toks.length > maxTokens) {
    const rest = toks.slice(maxTokens)
    rows.push({
      kind: 'more',
      key: `+${rest.length} tokens`,
      keys: rest.map(([t]) => t),
      hits: docs.map((_, i) => rest.some(([, set]) => set.has(i))),
    })
  }
  const gram = docs.map((d) => crossesCut(d, g))
  if (gram.some(Boolean)) rows.push({ kind: 'gram', key: g, hits: gram })
  const pass = docs.map((_, i) => rows.some((r) => r.hits[i]))
  return { g, rows, pass, nTokens: toks.length }
}

function crossesCut(doc, g) {
  const cuts = doc.cuts || []
  let i = doc.text.indexOf(g)
  while (i >= 0) {
    const s = i
    if (cuts.some((c) => c > s && c < s + g.length)) return true
    i = doc.text.indexOf(g, i + 1)
  }
  return false
}

// The tokens around a chunk where it crosses a cut, e.g. ·get|_.
export function gramView(doc, g) {
  const cuts = doc.cuts || []
  let i = doc.text.indexOf(g)
  while (i >= 0) {
    const s = i
    if (cuts.some((c) => c > s && c < s + g.length)) break
    i = doc.text.indexOf(g, i + 1)
  }
  if (i < 0) return null
  const toks = docTokens(doc)
  const parts = toks.filter((x) => x.s < i + g.length && x.s + x.t.length > i).map((x) => x.t)
  return parts.map(show).join('|')
}

const show = (s) => s.replace(/ /g, '·').replace(/\n/g, '⏎')

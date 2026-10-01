// Checks lib/regex-required.js: the filter must never drop a true match.
// Run: node experiments/regex-filter/check_required.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
const dir = mkdtempSync(join(tmpdir(), 'rq-'))
const f = join(dir, 'm.mjs')
writeFileSync(f, readFileSync(new URL('../../lib/regex-required.js', import.meta.url)))
const { requiredText, chunkLists } = await import(f)
const docs = JSON.parse(readFileSync(new URL('../../public/static/data/regex-filter-hero.json', import.meta.url))).docs
const pats = process.argv.slice(2).length ? process.argv.slice(2) : [
  'def get_\\w*conn', '(user|role)_\\w+ = ', 'user.*role|role.*user', 'Returns? (a|an) \\w+ connection',
  '\\s+', 'get_user', 'stdout|epoch', 'user_ids|has_role', '\\bget_\\w+\\(self\\)', 'get_conn(ection)?',
  '\\bconn\\s*=\\s*self\\.get_connection\\(', '(?:get|set)_(user|conn)', 'a{2,}b', 'x(?=abc)def',
]
let bad = 0
for (const p of pats) {
  const { branches, filterable } = requiredText(p)
  const rx = new RegExp(p)
  const truth = docs.map((d) => rx.test(d.text))
  // Per chunk, the lists it really reads: fitting tokens' lists plus its boundary gram.
  const passes = branches.map((b) => b.flatMap((pc) => Array.from({ length: Math.max(0, pc.text.length - 2) }, (_, p) => chunkLists(docs, pc.text, p).pass)))
  const surv = docs.map((_, i) => !filterable || passes.some((ch) => ch.every((pass) => pass[i])))
  const miss = docs.filter((_, i) => truth[i] && !surv[i]).map((d) => d.label)
  bad += miss.length
  const fp = docs.filter((_, i) => surv[i] && !truth[i]).map((d) => d.label)
  console.log(JSON.stringify(p), '->', filterable ? branches.map((b) => b.map((x) => JSON.stringify(x.text)).join(' AND ')).join('  OR  ') : '(nothing)',
    `| survive ${surv.filter(Boolean).length} true ${truth.filter(Boolean).length} missed ${miss.length}`, fp.length ? `| e.g. survives-but-fails: ${fp[0]}` : '')
}
console.log(bad ? `FAIL: ${bad} dropped matches` : 'ok: no true match dropped')

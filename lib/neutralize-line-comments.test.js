const { test } = require('node:test')
const assert = require('node:assert/strict')
const neutralizeLineComments = require('./neutralize-line-comments')

test('column-0 `// comment` becomes an MDX comment node', () => {
  assert.equal(neutralizeLineComments('// comment'), '{/* comment */}')
})

test('`// showText: false` before `export const x = 1` is neutralized (original bug)', () => {
  const input = ['// showText: false', 'export const x = 1'].join('\n')
  const expected = ['{/* showText: false */}', 'export const x = 1'].join('\n')
  assert.equal(neutralizeLineComments(input), expected)
})

test('```js fence preserves `// real code` and standalone `//` verbatim', () => {
  const input = ['```js', '// real code', '//', 'const x = 1', '```'].join('\n')
  assert.equal(neutralizeLineComments(input), input)
})

test('custom ```napkin fence preserves `//` lines', () => {
  const input = ['```napkin', '// a comment inside napkin', '```'].join('\n')
  assert.equal(neutralizeLineComments(input), input)
})

test('`~~~` fence variant preserves `//` lines', () => {
  const input = ['~~~', '// still code', '~~~'].join('\n')
  assert.equal(neutralizeLineComments(input), input)
})

test('URLs are left unchanged', () => {
  const input = ['See https://example.com/a//b', 'https://example.com/path'].join('\n')
  assert.equal(neutralizeLineComments(input), input)
})

test('trailing comment `const x = 5 // note` is unchanged', () => {
  const input = 'const x = 5 // note'
  assert.equal(neutralizeLineComments(input), input)
})

test('indented `  // inside object` (leading whitespace) is unchanged', () => {
  const input = '  // inside object'
  assert.equal(neutralizeLineComments(input), input)
})

test('`// close */ early` escapes the delimiter so it cannot terminate early', () => {
  assert.equal(neutralizeLineComments('// close */ early'), '{/* close * / early */}')
})

test('multiple fences: code inside all fences preserved, comments outside neutralized', () => {
  const input = [
    '// intro comment',
    '```js',
    '// code one',
    '```',
    '// between fences',
    '~~~',
    '// code two',
    '~~~',
    '// after fences',
  ].join('\n')
  const expected = [
    '{/* intro comment */}',
    '```js',
    '// code one',
    '```',
    '{/* between fences */}',
    '~~~',
    '// code two',
    '~~~',
    '{/* after fences */}',
  ].join('\n')
  assert.equal(neutralizeLineComments(input), expected)
})

test('a doc with no `//` at all is returned unchanged', () => {
  const input = ['# Title', '', 'Some **markdown** text.', '', 'export const y = 2'].join('\n')
  assert.equal(neutralizeLineComments(input), input)
})

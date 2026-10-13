import { describe, expect, test } from 'bun:test'
import { WORD_DIFF_MAX_TOKENS, wordDiffOf } from '../../hooks/views/diff/word-diff'

const joined = (segs: readonly { text: string }[]) => segs.map(seg => seg.text).join('')

describe('wordDiffOf', () => {
  test('a changed word is the only changed segment', () => {
    expect(wordDiffOf('let x = 1', 'let x = 2')).toEqual({
      left: [
        { text: 'let x = ', changed: false },
        { text: '1', changed: true },
      ],
      right: [
        { text: 'let x = ', changed: false },
        { text: '2', changed: true },
      ],
    })
  })

  test('an insertion marks only the inserted tokens on the new side', () => {
    expect(wordDiffOf('foo(a)', 'foo(a, b)')).toEqual({
      left: [{ text: 'foo(a)', changed: false }],
      right: [
        { text: 'foo(a', changed: false },
        { text: ', b', changed: true },
        { text: ')', changed: false },
      ],
    })
  })

  test('identical lines have nothing changed', () => {
    expect(wordDiffOf('same line', 'same line')).toEqual({
      left: [{ text: 'same line', changed: false }],
      right: [{ text: 'same line', changed: false }],
    })
  })

  test('lines sharing no word are changed whole', () => {
    expect(wordDiffOf('abc', 'xyz')).toEqual({
      left: [{ text: 'abc', changed: true }],
      right: [{ text: 'xyz', changed: true }],
    })
  })

  test('lines sharing only whitespace are changed whole, not speckled', () => {
    expect(wordDiffOf('foo bar', 'baz qux')).toEqual({
      left: [{ text: 'foo bar', changed: true }],
      right: [{ text: 'baz qux', changed: true }],
    })
  })

  test('an empty side has no segments', () => {
    expect(wordDiffOf('', 'x')).toEqual({ left: [], right: [{ text: 'x', changed: true }] })
    expect(wordDiffOf('x', '')).toEqual({ left: [{ text: 'x', changed: true }], right: [] })
  })

  test('a line past the token cap is changed whole even when one word differs', () => {
    const words = Array.from({ length: WORD_DIFF_MAX_TOKENS + 10 }, (_, i) => `w${i}`)
    const a = words.join(' ')
    const b = [...words.slice(0, -1), 'other'].join(' ')
    expect(wordDiffOf(a, b)).toEqual({
      left: [{ text: a, changed: true }],
      right: [{ text: b, changed: true }],
    })
  })

  test('the segments always rebuild their line', () => {
    const pairs: [string, string][] = [
      ['  return a + b', '  return a - b'],
      ['import { a } from "x"', 'import { a, b } from "x"'],
      ['\tfoo()', '\tbar()'],
      ['', ''],
      ['a', 'a b c'],
    ]
    for (const [oldLine, newLine] of pairs) {
      const { left, right } = wordDiffOf(oldLine, newLine)
      expect(joined(left)).toBe(oldLine)
      expect(joined(right)).toBe(newLine)
    }
  })
})

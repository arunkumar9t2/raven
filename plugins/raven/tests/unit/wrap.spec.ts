import { describe, expect, test } from 'bun:test'
import { cutTailToCells, cutToCells, widthOf, wrapText } from '../../hooks/ui/wrap'

describe('wrapText', () => {
  test('wraps at word boundaries within the width', () => {
    expect(wrapText('one two three four', 9, 9)).toEqual(['one two', 'three', 'four'])
  })

  test('a word longer than a line breaks hard', () => {
    expect(wrapText('abcdefghij', 4, 9)).toEqual(['abcd', 'efgh', 'ij'])
  })

  test('a newline starts a new line', () => {
    expect(wrapText('first\nsecond line', 40, 9)).toEqual(['first', 'second line'])
  })

  test('a trailing newline adds no empty line', () => {
    expect(wrapText('first\n', 40, 9)).toEqual(['first'])
  })

  test('maxLines cuts the text and ends the last line with an ellipsis within the width', () => {
    const lines = wrapText('aaaa bbbb cccc dddd eeee', 9, 2)
    expect(lines).toEqual(['aaaa bbbb', 'cccc ddd…'])
    expect(lines.every(line => [...line].length <= 9)).toBe(true)
  })

  test('text that fits maxLines is never marked', () => {
    expect(wrapText('aaaa bbbb', 9, 1)).toEqual(['aaaa bbbb'])
  })

  test('the first line may be narrower than the rest', () => {
    expect(wrapText('aaaa bbbb cccc', 10, 9, 4)).toEqual(['aaaa', 'bbbb cccc'])
  })

  test('wide characters count two cells', () => {
    expect(wrapText('漢字漢字', 4, 9)).toEqual(['漢字', '漢字'])
  })
})

describe('widthOf wide emoji', () => {
  test('emoji presentation symbols outside the pictograph block measure 2', () => {
    for (const glyph of [
      '✅',
      '❌',
      '⭐',
      '⌚',
      '⏩',
      '☔',
      '♈',
      '♿',
      '⚓',
      '⚡',
      '⚽',
      '⛄',
      '⛔',
      '✨',
      '❓',
      '➕',
      '➰',
      '⬛',
      '⭕',
      '🀄',
      '🃏',
      '🆎',
      '🆑',
      '🈁',
    ]) {
      expect(widthOf(glyph)).toBe(2)
    }
    expect(widthOf('✓')).toBe(1)
  })
})

describe('widthOf emoji sequences', () => {
  test('a narrow base with VS16 (U+FE0F) measures 2', () => {
    expect(widthOf('⚠️')).toBe(2)
    expect(widthOf('✔️')).toBe(2)
    expect(widthOf('❤️')).toBe(2)
    expect(widthOf('a⚠️b')).toBe(4)
  })

  test('a keycap sequence stays 2', () => {
    expect(widthOf('1️⃣')).toBe(2)
  })

  test('a ZWJ emoji sequence is one 2-cell grapheme', () => {
    expect(widthOf('👨‍👩‍👧')).toBe(2)
    expect(widthOf('👩‍⚕️')).toBe(2)
    expect(widthOf('x👨‍👩‍👧y')).toBe(4)
  })

  test('a lone VS16 after a wide or combining base adds nothing, other widths are unchanged', () => {
    expect(widthOf('✅️')).toBe(2)
    expect(widthOf('漢字')).toBe(4)
    expect(widthOf('é')).toBe(1)
    expect(widthOf('a‍b')).toBe(2)
    expect(widthOf('✓')).toBe(1)
  })

  test('a hard-broken word never splits a sequence and fits its width', () => {
    expect(wrapText('⚠️⚠️⚠️', 4, 9)).toEqual(['⚠️⚠️', '⚠️'])
    expect(wrapText('👨‍👩‍👧👨‍👩‍👧', 2, 9)).toEqual(['👨‍👩‍👧', '👨‍👩‍👧'])
  })
})

describe('cutToCells / cutTailToCells', () => {
  test('keep the head or the tail within the cells', () => {
    expect(cutToCells('abcdef', 3)).toBe('abc')
    expect(cutTailToCells('abcdef', 3)).toBe('def')
    expect(cutToCells('abc', 10)).toBe('abc')
    expect(cutTailToCells('abc', 10)).toBe('abc')
    expect(cutToCells('abc', 0)).toBe('')
    expect(cutTailToCells('abc', 0)).toBe('')
  })

  test('never split a wide character or a cluster', () => {
    expect(cutToCells('日本語', 5)).toBe('日本')
    expect(cutTailToCells('日本語', 5)).toBe('本語')
    expect(cutToCells('a👍🏽b', 2)).toBe('a')
    expect(cutTailToCells('a❤️b', 2)).toBe('b')
  })
})

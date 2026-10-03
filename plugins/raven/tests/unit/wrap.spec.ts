import { describe, expect, test } from 'bun:test'
import { wrapText } from '../../hooks/ui/wrap'

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

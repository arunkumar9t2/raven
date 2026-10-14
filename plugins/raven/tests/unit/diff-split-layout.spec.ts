import { describe, expect, test } from 'bun:test'
import {
  capLine,
  cleanTextOf,
  expandTabs,
  LINE_CAP,
  plainOf,
  sideCellOf,
  sideWidthsOf,
} from '../../hooks/views/diff/split-layout'

describe('sideWidthsOf', () => {
  test('two sides and a one-column divider', () => {
    expect(sideWidthsOf(161)).toEqual({ left: 80, right: 80 })
    expect(sideWidthsOf(160)).toEqual({ left: 79, right: 80 })
    expect(sideWidthsOf(100)).toEqual({ left: 49, right: 50 })
  })

  test('a degenerate width still gives each side a column', () => {
    expect(sideWidthsOf(1)).toEqual({ left: 1, right: 1 })
  })
})

describe('text cleaning', () => {
  test('control characters go, a tab stays for Code', () => {
    expect(cleanTextOf('a\rb\u0000c\td\u007fe\u0085f')).toBe('abc\tdef')
  })

  test('tabs expand to four spaces for a Text', () => {
    expect(expandTabs('\tx\ty')).toBe('    x    y')
    expect(plainOf('\tx\r')).toBe('    x')
  })

  test('a very long line is capped', () => {
    expect(capLine('x'.repeat(LINE_CAP + 50)).length).toBe(LINE_CAP)
    expect(capLine('short')).toBe('short')
  })

  test('the cap never leaves half an emoji', () => {
    const capped = capLine(`${'a'.repeat(LINE_CAP - 1)}😀b`)
    expect(capped.length).toBe(LINE_CAP - 1)
    expect(capped.endsWith('a')).toBe(true)
  })
})

describe('sideCellOf', () => {
  test('mark, right-aligned number, space, text, padded to the side width', () => {
    const cell = sideCellOf({ n: 7, text: 'ab', mark: '+' }, 3, 12)
    expect(cell).toEqual({
      prefix: '+  7 ',
      segs: [{ text: 'ab', changed: false }],
      pad: '     ',
    })
    expect(cell.prefix.length + 2 + cell.pad.length).toBe(12)
  })

  test('uses given word segments and pads to their width', () => {
    const cell = sideCellOf({ n: 1, text: 'ab', mark: '-' }, 1, 10, [
      { text: 'a', changed: false },
      { text: 'b', changed: true },
    ])
    expect(cell.segs.length).toBe(2)
    expect(cell.prefix).toBe('-1 ')
    expect(cell.pad).toBe(' '.repeat(10 - 3 - 2))
  })

  test('a line wider than the side gets no padding (the Text truncates it)', () => {
    expect(sideCellOf({ n: 1, text: 'x'.repeat(50), mark: ' ' }, 1, 10).pad).toBe('')
  })

  test('pad counts display width: CJK is two cells, VS16 emoji two', () => {
    const cjk = sideCellOf({ n: 1, text: '日本', mark: ' ' }, 1, 12)
    expect(cjk.pad).toBe(' '.repeat(12 - 3 - 4))
    const vs = sideCellOf({ n: 1, text: '\u2764\uFE0F', mark: ' ' }, 1, 12)
    expect(vs.pad).toBe(' '.repeat(12 - 3 - 2))
  })

  test('tabs and carriage returns in the text are made drawable', () => {
    expect(sideCellOf({ n: 1, text: '\ta\r', mark: ' ' }, 1, 20).segs).toEqual([
      { text: '    a', changed: false },
    ])
  })
})

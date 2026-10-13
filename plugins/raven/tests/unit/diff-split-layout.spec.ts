import { describe, expect, test } from 'bun:test'
import type { SplitRow } from '../../hooks/views/diff/split'
import {
  capLine,
  cleanTextOf,
  codeTextOf,
  columnOf,
  expandTabs,
  LINE_CAP,
  piecesOf,
  plainOf,
  runsOf,
  sideCellOf,
  sideWidthsOf,
} from '../../hooks/views/diff/split-layout'

const ctx = (n: number, text: string): SplitRow => ({
  kind: 'context',
  left: { n, text, mark: ' ' },
  right: { n, text, mark: ' ' },
})
const change = (l: string | null, r: string | null, n = 1): SplitRow => ({
  kind: 'change',
  left: l === null ? null : { n, text: l, mark: '-' },
  right: r === null ? null : { n, text: r, mark: '+' },
})

describe('runsOf', () => {
  test('groups consecutive rows of one kind', () => {
    const rows = [ctx(1, 'a'), change('b', 'B'), change('c', null), ctx(4, 'd'), change(null, 'e')]
    expect(runsOf(rows)).toEqual([
      { kind: 'context', from: 0, to: 1 },
      { kind: 'change', from: 1, to: 3 },
      { kind: 'context', from: 3, to: 4 },
      { kind: 'change', from: 4, to: 5 },
    ])
  })

  test('no rows, no runs', () => {
    expect(runsOf([])).toEqual([])
  })
})

describe('piecesOf', () => {
  test('rows that fit the cap stay one piece', () => {
    expect(piecesOf([change('a', 'b'), change('c', 'd')], 10_000)).toEqual([[0, 2]])
  })

  test('the cap cuts a run into pieces at the same rows for both sides', () => {
    const big = 'x'.repeat(900)
    const rows = Array.from({ length: 12 }, () => change(big, 'y'))
    const pieces = piecesOf(rows, 10_000)
    expect(pieces.length).toBe(2)
    expect(pieces[0]).toEqual([0, 11])
    expect(pieces[1]).toEqual([11, 12])
    for (const [from, to] of pieces) {
      const left = rows
        .slice(from, to)
        .reduce((sum, row) => sum + (row.left?.text.length ?? 0) + 1, 0)
      expect(left).toBeLessThanOrEqual(10_000)
    }
  })

  test('the heavier side decides, and every piece takes at least one row', () => {
    const big = 'z'.repeat(LINE_CAP * 2)
    const rows = [change('a', big), change('b', big)]
    expect(piecesOf(rows, 1_001)).toEqual([
      [0, 1],
      [1, 2],
    ])
  })

  test('a null side costs one newline, as the renderer draws it', () => {
    const rows = [change(null, 'a'), change(null, 'b'), change(null, 'c')]
    expect(piecesOf(rows, 2)).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ])
    expect(piecesOf(rows, 4)).toEqual([
      [0, 2],
      [2, 3],
    ])
  })

  test('a row costing exactly the limit fits; one more cuts', () => {
    const rows = [change('abc', 'x'), change('d', 'y')]
    expect(piecesOf(rows, 6)).toEqual([[0, 2]])
    expect(piecesOf(rows, 5)).toEqual([
      [0, 1],
      [1, 2],
    ])
  })

  test('no rows, no pieces', () => {
    expect(piecesOf([], 100)).toEqual([])
  })
})

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
    expect(codeTextOf('x'.repeat(LINE_CAP + 50)).length).toBe(LINE_CAP)
    expect(capLine('short')).toBe('short')
  })

  test('the cap never leaves half an emoji', () => {
    const capped = capLine(`${'a'.repeat(LINE_CAP - 1)}😀b`)
    expect(capped.length).toBe(LINE_CAP - 1)
    expect(capped.endsWith('a')).toBe(true)
  })
})

describe('columnOf', () => {
  test('repeats a glyph down n rows', () => {
    expect(columnOf('▌', 3)).toBe('▌\n▌\n▌')
    expect(columnOf('│', 1)).toBe('│')
    expect(columnOf('│', 0)).toBe('')
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

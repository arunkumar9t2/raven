import { describe, expect, test } from 'bun:test'
import {
  drawnRowsOf,
  layoutTable,
  spansOf,
  type TableData,
  type TableLayout,
} from '../../hooks/ui/table-layout'
import { widthOf } from '../../hooks/ui/wrap'

const simple: TableData = {
  header: ['Path', 'Note'],
  align: ['left', 'right'],
  rows: [['a.ts', 'short']],
}

const wide: TableData = {
  header: ['Path', 'What Claude sees'],
  align: ['left', 'left'],
  rows: [
    [
      '`hooks/views/doc-view.tsx`',
      'The engine **sizes GFM tables to the terminal width**, not the pane, so every row wraps and the `box borders` break apart into a mess of stray characters when the pane is narrower than the terminal itself.',
    ],
    ['b.ts', 'ok'],
  ],
}

/** A layout's drawn rows as plain strings. */
const linesOf = (layout: TableLayout) =>
  drawnRowsOf(layout).map(line => line.map(piece => piece.text).join(''))
const maxWidth = (lines: string[]) => Math.max(...lines.map(widthOf))

describe('spansOf', () => {
  test('bold and code keep styles, markers vanish', () => {
    expect(spansOf('a **b** `c d` e')).toEqual([
      { text: 'a ', style: 'plain' },
      { text: 'b', style: 'bold' },
      { text: ' ', style: 'plain' },
      { text: 'c d', style: 'code' },
      { text: ' e', style: 'plain' },
    ])
  })

  test('links, italics and underscores draw as visible text', () => {
    const text = (s: string) =>
      spansOf(s)
        .map(x => x.text)
        .join('')
    expect(text('[docs](http://x.io/a_b) and *it* and _em_')).toBe('docs and it and em')
    expect(text('snake_case_name')).toBe('snake_case_name')
    expect(text('2 * 3 * 4')).toBe('2 * 3 * 4')
  })
})

describe('layoutTable', () => {
  test('fits at natural width when it can', () => {
    const layout = layoutTable(simple, 80)
    expect(layout.kind).toBe('grid')
    expect(linesOf(layout)).toEqual([
      '┌──────┬───────┐',
      '│ Path │ Note  │',
      '├──────┼───────┤',
      '│ a.ts │ short │',
      '└──────┴───────┘',
    ])
  })

  test('long cells shrink and wrap within the width', () => {
    for (const width of [60, 80, 100, 140]) {
      const layout = layoutTable(wide, width)
      expect(layout.kind).toBe('grid')
      const lines = linesOf(layout)
      expect(maxWidth(lines)).toBeLessThanOrEqual(width)
      expect(lines[0]?.startsWith('┌')).toBe(true)
      expect(lines.at(-1)?.startsWith('└')).toBe(true)
    }
    expect(linesOf(layoutTable(wide, 60)).length).toBeGreaterThan(8)
  })

  test('a word longer than its column hard-breaks', () => {
    const table: TableData = {
      header: ['A', 'B'],
      align: ['left', 'left'],
      rows: [['q'.repeat(50), 'one two three four five six seven eight nine ten eleven twelve']],
    }
    const lines = linesOf(layoutTable(table, 40))
    expect(maxWidth(lines)).toBeLessThanOrEqual(40)
    expect(lines.join('\n').replace(/[^q]/g, '').length).toBe(50)
  })

  test('a long path breaks after a separator, not mid-name', () => {
    const table: TableData = {
      header: ['Path', 'Note'],
      align: ['left', 'left'],
      rows: [
        [
          'plugins/raven/hooks/views/doc-view.tsx',
          'a fairly long note that wraps over a few lines here',
        ],
      ],
    }
    const lines = linesOf(layoutTable(table, 60))
    const text = lines.join('\n')
    expect(text).toContain('plugins/raven/hooks/views/ ')
    expect(text).toContain('doc-view.tsx')
    expect(maxWidth(lines)).toBeLessThanOrEqual(60)
  })

  test('with no separator a word still hard-breaks', () => {
    const lines = linesOf(
      layoutTable({ header: ['A'], align: ['left'], rows: [['abcdefghijklmnopqrstuvwxyz']] }, 14),
    )
    expect(lines.join('').replace(/[^a-z]/g, '')).toBe('abcdefghijklmnopqrstuvwxyz')
    expect(maxWidth(lines)).toBeLessThanOrEqual(14)
  })

  test('falls back to records when even the minimums do not fit', () => {
    const layout = layoutTable(wide, 14)
    expect(layout.kind).toBe('records')
    const lines = linesOf(layout)
    expect(maxWidth(lines)).toBeLessThanOrEqual(14)
    expect(lines[0]).toBe('Path:')
    expect(lines).toContain('')
    expect(lines.join(' ')).toContain('What Claude sees:')
  })

  test('markers do not count toward width and styles survive a wrap', () => {
    const table: TableData = {
      header: ['H'],
      align: ['left'],
      rows: [['**bold words here** `code`']],
    }
    const natural = layoutTable(table, 80)
    // "bold words here code" = 20 visible cells + 4 overhead
    expect(maxWidth(linesOf(natural))).toBe(24)

    const narrow = layoutTable(table, 14)
    expect(narrow.kind).toBe('grid')
    const pieces = drawnRowsOf(narrow).flat()
    expect(maxWidth(linesOf(narrow))).toBeLessThanOrEqual(14)
    expect(pieces.filter(p => p.style === 'bold' && p.text.trim() !== '').length).toBeGreaterThan(1)
    expect(pieces.some(p => p.style === 'code' && p.text === 'code')).toBe(true)
    expect(linesOf(narrow).join('')).not.toContain('*')
  })

  test('body alignment is honoured, header centred', () => {
    const lines = linesOf(
      layoutTable({ header: ['Name', 'N'], align: ['center', 'right'], rows: [['ab', '1']] }, 80),
    )
    expect(lines[3]).toBe('│  ab  │ 1 │')
    const wideHead = linesOf(
      layoutTable(
        { header: ['Wide header', 'N'], align: ['center', 'right'], rows: [['ab', '1']] },
        80,
      ),
    )
    expect(wideHead[3]).toBe('│     ab      │ 1 │')
  })
})

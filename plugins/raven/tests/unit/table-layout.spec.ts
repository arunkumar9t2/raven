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

/** A layout's drawn rows at the given corners, as plain strings. */
const drawn = (layout: TableLayout, corners?: 'sharp' | 'rounded') =>
  drawnRowsOf(layout, corners).map(line => line.map(piece => piece.text).join(''))

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

describe('wide emoji in cells', () => {
  test('every drawn line has the same width, so the borders stay aligned', () => {
    const data: TableData = {
      header: ['State', 'Note'],
      align: ['left', 'left'],
      rows: [
        ['✅ done', '❌ no'],
        ['⭐ star', 'plain'],
      ],
    }
    // ✅ ❌ ⭐ are one code point but two cells: count them twice for the real drawn width.
    const cells = (line: string) => [...line].length + (line.match(/[✅❌⭐]/g) ?? []).length
    const widths = new Set(linesOf(layoutTable(data, 40)).map(cells))
    expect(widths.size).toBe(1)
  })
})

describe('grid corners', () => {
  test('rounded swaps only the four outer corners', () => {
    const layout = layoutTable(simple, 80, 'grid')
    expect(drawn(layout, 'rounded')).toEqual([
      '╭──────┬───────╮',
      '│ Path │ Note  │',
      '├──────┼───────┤',
      '│ a.ts │ short │',
      '╰──────┴───────╯',
    ])
  })

  test('sharp is the default and the old output', () => {
    expect(drawn(layoutTable(simple, 80))).toEqual(drawn(layoutTable(simple, 80), 'sharp'))
    expect(drawn(layoutTable(simple, 80))[0]).toBe('┌──────┬───────┐')
  })
})

describe('rule tables', () => {
  test('header, one rule, rows; columns two spaces apart, no verticals, aligned per column', () => {
    expect(drawn(layoutTable(simple, 80, 'rule'))).toEqual([
      'Path   Note',
      '───────────',
      'a.ts  short',
    ])
  })

  test('the header is bold and the rule is a border piece', () => {
    const lines = drawnRowsOf(layoutTable(simple, 80, 'rule'))
    const header = (lines[0] ?? []).filter(piece => piece.text.trim() !== '')
    expect(header.every(piece => piece.style === 'bold')).toBe(true)
    expect(lines[1]).toEqual([{ text: '─'.repeat(11), style: 'border' }])
  })

  test('no vertical or corner glyph anywhere', () => {
    const text = drawn(layoutTable(wide, 60, 'rule')).join('\n')
    expect(text).not.toMatch(/[│┌┐└┘├┤┬┴┼╭╮╰╯]/)
  })

  test('fits the width it is given and wraps cells like a grid', () => {
    for (const width of [40, 60, 80]) {
      const layout = layoutTable(wide, width, 'rule')
      if (layout.kind !== 'grid') continue
      const lines = drawn(layout)
      expect(maxWidth(lines)).toBeLessThanOrEqual(width)
      // one rule line, directly under the (possibly wrapped) header
      const headerHeight = layout.header.reduce((m, cell) => Math.max(m, cell.length), 1)
      expect(lines.filter(line => /^─+$/.test(line))).toHaveLength(1)
      expect(/^─+$/.test(lines[headerHeight] ?? '')).toBe(true)
    }
  })

  test('rule needs less room than a grid, so a table that is records as a grid can still be a table', () => {
    const table = {
      header: ['A', 'B', 'C'],
      align: ['left', 'left', 'left'] as ('left' | 'center' | 'right')[],
      rows: [['aaaaaa', 'bbbbbb', 'cccccc']],
    }
    // grid overhead for 3 columns is 10, rule overhead is 4; 6 + 6 + 6 + 4 = 22 fits 22, 6 + 6 + 6 + 10 does not
    expect(layoutTable(table, 22, 'grid').kind).toBe('records')
    expect(layoutTable(table, 22, 'rule').kind).toBe('grid')
  })

  test('a narrow pane still falls back to records in rule mode', () => {
    expect(layoutTable(wide, 14, 'rule').kind).toBe('records')
  })

  test('a header-only table is the header and its rule', () => {
    const lines = drawn(
      layoutTable({ header: ['A', 'B'], align: ['left', 'left'], rows: [] }, 40, 'rule'),
    )
    expect(lines).toEqual(['A  B', '────'])
  })
})

describe('emoji cell widths', () => {
  test('a VS16 and a ZWJ cell align the grid like a plain one', () => {
    const data: TableData = {
      header: ['Mark', 'Who'],
      align: ['left', 'left'],
      rows: [
        ['⚠️', '👨‍👩‍👧'],
        ['ok', 'plain'],
      ],
    }
    const lines = drawn(layoutTable(data, 60), 'sharp')
    const widths = lines.map(widthOf)
    expect(new Set(widths).size).toBe(1)
    // columns of 4 (the header) and 5 cells, plus the grid's 3n + 1 borders
    expect(widths[0]).toBe(4 + 5 + 7)
  })
})

import { describe, expect, test } from 'bun:test'
import type { Hunk } from '../../hooks/git/hunks'
import {
  type Block,
  clampTop,
  contentRowsOf,
  rowOfKey,
  rowsOf,
  sliceHunk,
  windowOf,
} from '../../hooks/views/diff/layout'

function hunkOf(header: string, lines: readonly string[]): Hunk {
  return { header, text: `${[header, ...lines].join('\n')}\n` }
}

const hunk10 = hunkOf(
  '@@ -1,10 +1,10 @@',
  Array.from({ length: 10 }, (_, i) => ` line${i}`),
)
const hunk5 = hunkOf(
  '@@ -1,5 +1,5 @@',
  Array.from({ length: 5 }, (_, i) => ` line${i}`),
)

const fixed1: Block = { kind: 'fixed', key: 'h1', rows: 1 }
const hunkBlock10: Block = { kind: 'hunk', key: 'hk1', hunk: hunk10 }
const fixed2: Block = { kind: 'fixed', key: 'h2', rows: 2 }
const hunkBlock5: Block = { kind: 'hunk', key: 'hk2', hunk: hunk5 }
const blocks: Block[] = [fixed1, hunkBlock10, fixed2, hunkBlock5]

describe('rowsOf / contentRowsOf', () => {
  test('fixed block rows is its declared rows', () => {
    expect(rowsOf(fixed1)).toBe(1)
    expect(rowsOf(fixed2)).toBe(2)
  })

  test('hunk block rows is its body line count, header excluded', () => {
    expect(rowsOf(hunkBlock10)).toBe(10)
    expect(rowsOf(hunkBlock5)).toBe(5)
  })

  test('contentRowsOf sums every block', () => {
    expect(contentRowsOf(blocks)).toBe(1 + 10 + 2 + 5)
  })
})

describe('windowOf', () => {
  test('top 0: fixed(1) whole, hunk10 sliced to fill the rest', () => {
    const placed = windowOf(blocks, 0, 5)
    expect(placed).toEqual([
      { block: fixed1, from: 0, to: 1 },
      { block: hunkBlock10, from: 0, to: 4 },
    ])
  })

  test('top mid-hunk: fixed block excluded, hunk sliced from its middle', () => {
    const placed = windowOf(blocks, 3, 4)
    expect(placed).toEqual([{ block: hunkBlock10, from: 2, to: 6 }])
  })

  test('top spanning hunk10 tail, fixed2 and into hunk5', () => {
    const placed = windowOf(blocks, 9, 6)
    expect(placed).toEqual([
      { block: hunkBlock10, from: 8, to: 10 },
      { block: fixed2, from: 0, to: 2 },
      { block: hunkBlock5, from: 0, to: 2 },
    ])
  })

  test('fixed block whose first row is above top is excluded even if its tail is visible', () => {
    // fixed2 spans rows [11,13); asking from row 12 puts its first row above top
    const placed = windowOf(blocks, 12, 3)
    expect(placed.some(p => p.block === fixed2)).toBe(false)
  })

  test('window past the end returns nothing', () => {
    expect(windowOf(blocks, 100, 5)).toEqual([])
  })
})

describe('sliceHunk', () => {
  // body: 0 ' a' 1 ' b' 2 '-c' 3 '+d' 4 '+e' 5 ' f' 6 '-g' 7 ' h'
  // old: a,b,c,f,g,h = 6  new: a,b,d,e,f,h = 6
  const hunk = hunkOf('@@ -1,6 +1,6 @@', [' a', ' b', '-c', '+d', '+e', ' f', '-g', ' h'])

  test('slice from 0 keeps the original header numbers', () => {
    const sliced = sliceHunk(hunk, 0, 8)
    expect(sliced.header).toBe('@@ -1,6 +1,6 @@')
  })

  test('mid-hunk slice renumbers both starts and counts', () => {
    const sliced = sliceHunk(hunk, 2, 6)
    expect(sliced.header).toBe('@@ -3,2 +3,3 @@')
    expect(sliced.text).toBe('@@ -3,2 +3,3 @@\n-c\n+d\n+e\n f\n')
  })

  test('a single trailing line slice starts counts at their true offset', () => {
    const sliced = sliceHunk(hunk, 7, 8)
    expect(sliced.header).toBe('@@ -6,1 +6,1 @@')
  })

  test('old and new starts diverge when the leading counts differ', () => {
    // before = [' a', ' b', '-c']: 3 old lines, 2 new lines
    const sliced = sliceHunk(hunk, 3, 6)
    expect(sliced.header).toBe('@@ -4,1 +3,3 @@')
    expect(sliced.text).toBe('@@ -4,1 +3,3 @@\n+d\n+e\n f\n')
  })

  test('"\\ No newline at end of file" counts for neither old nor new', () => {
    const noNewline = hunkOf('@@ -1,2 +1,2 @@', [
      ' unchanged',
      '-removed',
      '\\ No newline at end of file',
      '+added',
    ])

    const full = sliceHunk(noNewline, 0, 4)
    expect(full.header).toBe('@@ -1,2 +1,2 @@')

    const tail = sliceHunk(noNewline, 2, 4)
    expect(tail.header).toBe('@@ -3,0 +2,1 @@')
    expect(tail.text).toBe('@@ -3,0 +2,1 @@\n\\ No newline at end of file\n+added\n')
  })
})

describe('clampTop', () => {
  test('content shrinks below the window: clamps to 0', () => {
    expect(clampTop(20, 5, 10)).toBe(0)
  })

  test('clamps to the last full page at the end', () => {
    expect(clampTop(1000, 23, 10)).toBe(13)
  })

  test('leaves an in-range top untouched', () => {
    expect(clampTop(4, 23, 10)).toBe(4)
  })

  test('never goes negative', () => {
    expect(clampTop(-5, 23, 10)).toBe(0)
  })
})

describe('windowOf on a large hunk', () => {
  test('a 5000-line hunk windowed at top 2500 rows 40 slices to exactly 40 lines under 10000 chars', () => {
    const lines = Array.from({ length: 5000 }, (_, i) => ` line${i}`)
    const big = { kind: 'hunk', key: 'big', hunk: hunkOf('@@ -1,5000 +1,5000 @@', lines) } as const

    const placed = windowOf([big], 2500, 40)
    expect(placed).toEqual([{ block: big, from: 2500, to: 2540 }])

    const { from, to } = placed[0] as { from: number; to: number }
    const sliced = sliceHunk(big.hunk, from, to)
    const bodyLineCount = sliced.text.split('\n').length - 2 // header line + trailing ''
    expect(bodyLineCount).toBe(40)
    expect(sliced.text.length).toBeLessThan(10_000)
  })
})

describe('rowOfKey', () => {
  test('finds a fixed block by key', () => {
    expect(rowOfKey(blocks, 'h1')).toBe(0)
    expect(rowOfKey(blocks, 'h2')).toBe(11)
  })

  test('finds a hunk block by key', () => {
    expect(rowOfKey(blocks, 'hk1')).toBe(1)
    expect(rowOfKey(blocks, 'hk2')).toBe(13)
  })

  test('returns null for an absent key', () => {
    expect(rowOfKey(blocks, 'missing')).toBeNull()
  })
})

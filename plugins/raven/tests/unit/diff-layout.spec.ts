import { describe, expect, test } from 'bun:test'
import type { Hunk } from '../../hooks/git/hunks'
import {
  type Block,
  clampTop,
  contentRowsOf,
  fileWindowOf,
  rowOfKey,
  rowsOf,
  sliceHunk,
  stepFileIndexOf,
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

const fixed1: Block = { kind: 'fixed', key: 'h1', rows: 1, item: null }
const hunkBlock10: Block = { kind: 'hunk', key: 'hk1', hunk: hunk10 }
const fixed2: Block = { kind: 'fixed', key: 'h2', rows: 2, item: null }
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

  test('a fixed block straddling the top stays placed, its top rows clipped', () => {
    // fixed2 spans rows [11,13); asking from row 12 clips its first row
    const placed = windowOf(blocks, 12, 3)
    expect(placed.find(p => p.block === fixed2)).toEqual({ block: fixed2, from: 1, to: 2 })
  })

  test("the window's rows stay exact while a card straddles the top", () => {
    for (const top of [11, 12]) {
      const placed = windowOf(blocks, top, 4)
      const drawn = placed.reduce((sum, p) => sum + (p.to - p.from), 0)
      expect(drawn).toBe(4)
    }
  })

  test('a pinned block (the compose box) is placed whole even when it straddles the top', () => {
    const pinned: Block = { kind: 'fixed', key: 'box', rows: 3, item: null, pinned: true }
    const placed = windowOf([fixed1, pinned], 2, 4)
    expect(placed).toEqual([{ block: pinned, from: 0, to: 3 }])
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

describe('fileWindowOf', () => {
  test('a list that fits shows every item, no more row', () => {
    expect(fileWindowOf(5, 2, 8)).toEqual({ start: 0, end: 5, more: 0 })
  })

  test('a list over the cap windows max-1 items around the selection plus a more count', () => {
    const { start, end, more } = fileWindowOf(20, 10, 8)
    expect(end - start).toBe(7)
    expect(more).toBe(20 - end)
    expect(start).toBeLessThanOrEqual(10)
    expect(end).toBeGreaterThan(10)
  })

  test('selection near the start clamps the window to the front', () => {
    expect(fileWindowOf(20, 0, 8)).toEqual({ start: 0, end: 7, more: 13 })
  })

  test('selection near the end clamps the window to the back', () => {
    expect(fileWindowOf(20, 19, 8)).toEqual({ start: 13, end: 20, more: 0 })
  })

  test('no selection (-1) windows from the front', () => {
    expect(fileWindowOf(20, -1, 8)).toEqual({ start: 0, end: 7, more: 13 })
  })
})

describe('stepFileIndexOf', () => {
  test('steps to the next file', () => {
    expect(stepFileIndexOf(3, 0, 1)).toBe(1)
  })

  test('steps to the previous file', () => {
    expect(stepFileIndexOf(3, 1, -1)).toBe(0)
  })

  test('clamps at the last file', () => {
    expect(stepFileIndexOf(3, 2, 1)).toBe(2)
  })

  test('clamps at the first file', () => {
    expect(stepFileIndexOf(3, 0, -1)).toBe(0)
  })

  test('no selection steps from the front', () => {
    expect(stepFileIndexOf(3, -1, 1)).toBe(0)
    expect(stepFileIndexOf(3, -1, -1)).toBe(0)
  })

  test('an empty list has no index', () => {
    expect(stepFileIndexOf(0, -1, 1)).toBe(-1)
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

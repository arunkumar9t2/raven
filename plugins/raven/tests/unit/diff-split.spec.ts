import { describe, expect, test } from 'bun:test'
import { hunkFrom } from '../../hooks/git/hunks'
import {
  effectiveLineOf,
  gutterWidthOf,
  pickableLinesOf,
  runEndOf,
  type SideLine,
  splitHunkOf,
  splitRowsOf,
  splitRowsOfHunk,
} from '../../hooks/views/diff/split'

const body = (...lines: string[]) => lines.join('\n')
const side = (n: number, text: string, mark: SideLine['mark']): SideLine => ({ n, text, mark })

describe('splitRowsOf', () => {
  test('an empty body has no rows', () => {
    expect(splitRowsOf('', 1, 1)).toEqual([])
  })

  test('context lines draw on both sides with each side counting on its own', () => {
    expect(splitRowsOf(body(' a', ' b'), 5, 7)).toEqual([
      { kind: 'context', left: side(5, 'a', ' '), right: side(7, 'a', ' ') },
      { kind: 'context', left: side(6, 'b', ' '), right: side(8, 'b', ' ') },
    ])
  })

  test('a pure add pads the left side with blanks', () => {
    expect(splitRowsOf(body(' a', '+b', '+c', ' d'), 1, 1)).toEqual([
      { kind: 'context', left: side(1, 'a', ' '), right: side(1, 'a', ' ') },
      { kind: 'change', left: null, right: side(2, 'b', '+') },
      { kind: 'change', left: null, right: side(3, 'c', '+') },
      { kind: 'context', left: side(2, 'd', ' '), right: side(4, 'd', ' ') },
    ])
  })

  test('a pure remove pads the right side with blanks', () => {
    expect(splitRowsOf(body(' a', '-b', '-c', ' d'), 1, 1)).toEqual([
      { kind: 'context', left: side(1, 'a', ' '), right: side(1, 'a', ' ') },
      { kind: 'change', left: side(2, 'b', '-'), right: null },
      { kind: 'change', left: side(3, 'c', '-'), right: null },
      { kind: 'context', left: side(4, 'd', ' '), right: side(2, 'd', ' ') },
    ])
  })

  test('two removed lines replaced by three added pair up and pad the left side last', () => {
    expect(splitRowsOf(body('-x', '-y', '+X', '+Y', '+Z'), 10, 20)).toEqual([
      { kind: 'change', left: side(10, 'x', '-'), right: side(20, 'X', '+') },
      { kind: 'change', left: side(11, 'y', '-'), right: side(21, 'Y', '+') },
      { kind: 'change', left: null, right: side(22, 'Z', '+') },
    ])
  })

  test('three removed lines replaced by two added pad the right side last', () => {
    expect(splitRowsOf(body('-x', '-y', '-z', '+X', '+Y'), 1, 1)).toEqual([
      { kind: 'change', left: side(1, 'x', '-'), right: side(1, 'X', '+') },
      { kind: 'change', left: side(2, 'y', '-'), right: side(2, 'Y', '+') },
      { kind: 'change', left: side(3, 'z', '-'), right: null },
    ])
  })

  test('added lines listed before removed ones in one run pair the same way', () => {
    expect(splitRowsOf(body('+B', '-b'), 3, 3)).toEqual([
      { kind: 'change', left: side(3, 'b', '-'), right: side(3, 'B', '+') },
    ])
  })

  test('interleaved runs pair within each run only', () => {
    expect(splitRowsOf(body(' a', '-b', '+B', ' c', '-d', '+D', '+E'), 1, 1)).toEqual([
      { kind: 'context', left: side(1, 'a', ' '), right: side(1, 'a', ' ') },
      { kind: 'change', left: side(2, 'b', '-'), right: side(2, 'B', '+') },
      { kind: 'context', left: side(3, 'c', ' '), right: side(3, 'c', ' ') },
      { kind: 'change', left: side(4, 'd', '-'), right: side(4, 'D', '+') },
      { kind: 'change', left: null, right: side(5, 'E', '+') },
    ])
  })

  test('a "No newline" marker is not a row and does not split a run', () => {
    const rows = splitRowsOf(
      body('-a', '\\ No newline at end of file', '+a', '\\ No newline at end of file'),
      1,
      1,
    )
    expect(rows).toEqual([{ kind: 'change', left: side(1, 'a', '-'), right: side(1, 'a', '+') }])
  })

  test('text keeps its leading whitespace and any later + or - characters', () => {
    expect(splitRowsOf(body('+  + x', '- - y'), 1, 1)).toEqual([
      { kind: 'change', left: side(1, ' - y', '-'), right: side(1, '  + x', '+') },
    ])
  })
})

describe('splitRowsOfHunk / splitHunkOf / gutterWidthOf', () => {
  const hunk = hunkFrom('@@ -10,2 +20,2 @@', [' a', '-b', '+c'])

  test('numbers from the header and is memoized per hunk', () => {
    const rows = splitRowsOfHunk(hunk)
    expect(rows).toEqual([
      { kind: 'context', left: side(10, 'a', ' '), right: side(20, 'a', ' ') },
      { kind: 'change', left: side(11, 'b', '-'), right: side(21, 'c', '+') },
    ])
    expect(splitRowsOfHunk(hunk)).toBe(rows)
  })

  test('a malformed header numbers from 1', () => {
    expect(splitRowsOfHunk(hunkFrom('@@ nope @@', ['+a']))).toEqual([
      { kind: 'change', left: null, right: side(1, 'a', '+') },
    ])
  })

  test('the gutter is the digit count of the highest line number either side reaches', () => {
    expect(gutterWidthOf(hunkFrom('@@ -98,3 +100,4 @@', []))).toBe(3)
    expect(gutterWidthOf(hunkFrom('@@ -0,0 +1,3 @@', []))).toBe(1)
    expect(gutterWidthOf(hunkFrom('@@ -1,1 +1,1 @@', []))).toBe(1)
    expect(gutterWidthOf(hunkFrom('@@ -9,2 +9,2 @@', []))).toBe(2)
    expect(gutterWidthOf(hunkFrom('garbage', []))).toBe(1)
  })

  test("splitHunkOf defaults the gutter to the hunk's own and takes an override", () => {
    expect(splitHunkOf(hunk).gutter).toBe(2)
    expect(splitHunkOf(hunk, 4).gutter).toBe(4)
    expect(splitHunkOf(hunk).rows).toBe(splitRowsOfHunk(hunk))
  })
})

describe('runEndOf', () => {
  const lines = [' ctx0', '-old1', '-old2', '+new1', '+new2', '+new3', ' ctx6']

  test('a context line ends at itself', () => {
    expect(runEndOf(lines, 0)).toBe(1)
    expect(runEndOf(lines, 6)).toBe(7)
  })

  test('any line of a change run ends at the end of that run', () => {
    for (const at of [1, 2, 3, 4, 5]) expect(runEndOf(lines, at)).toBe(6)
  })

  test('a "No newline" marker stays with the line above it, inside a run or after context', () => {
    const marked = [
      ' a',
      '-b',
      '\\ No newline at end of file',
      '+B',
      '\\ No newline at end of file',
      ' c',
    ]
    expect(runEndOf(marked, 1)).toBe(5)
    expect(runEndOf(marked, 3)).toBe(5)
    const ctxMarked = [' a', '\\ No newline at end of file', ' b']
    expect(runEndOf(ctxMarked, 0)).toBe(2)
  })

  test('the last line of the body ends at the body length', () => {
    expect(runEndOf(['+a', '+b'], 0)).toBe(2)
    expect(runEndOf(['+a', '+b'], 1)).toBe(2)
  })
})

describe('pickableLinesOf', () => {
  const lines = [
    { number: 2, side: 'old' as const, text: 'old1' },
    { number: 2, side: 'new' as const, text: 'new1' },
  ]

  test('unified offers both sides', () => {
    expect(pickableLinesOf(lines, false)).toEqual(lines)
  })

  test('split offers the new side only; a removed-only hunk offers none', () => {
    expect(pickableLinesOf(lines, true)).toEqual(lines.slice(1))
    expect(pickableLinesOf([lines[0] as (typeof lines)[number]], true)).toEqual([])
  })
})

describe('effectiveLineOf', () => {
  const oldLine = { number: 2, side: 'old' as const, text: 'old1' }
  const newLine = { number: 2, side: 'new' as const, text: 'new1' }

  test('split turns an old-side pick into "whole hunk" (null), so a submit saves the hunk', () => {
    expect(effectiveLineOf(oldLine, true)).toBeNull()
  })

  test('split keeps a new-side pick; unified keeps either; null stays null', () => {
    expect(effectiveLineOf(newLine, true)).toBe(newLine)
    expect(effectiveLineOf(oldLine, false)).toBe(oldLine)
    expect(effectiveLineOf(null, true)).toBeNull()
  })
})

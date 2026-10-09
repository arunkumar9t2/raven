import { describe, expect, test } from 'bun:test'
import { COLORS } from '../../hooks/core/colors'
import type { ChangedFile } from '../../hooks/git/changes'
import { ageOf } from '../../hooks/ui/age'
import { changeMapOf } from '../../hooks/ui/change-map'
import { progressCells } from '../../hooks/ui/progress-bar'
import { statBarCells } from '../../hooks/ui/stat-bar'

const fileOf = (
  path: string,
  adds: number,
  dels: number,
  status: ChangedFile['status'] = 'modified',
): ChangedFile => ({
  path,
  status,
  adds,
  dels,
  isBinary: false,
})

describe('ageOf', () => {
  test('under a minute reads "now"', () => {
    expect(ageOf(0, 59_000)).toBe('now')
  })

  test('minutes, floored', () => {
    expect(ageOf(0, 2 * 60_000 + 30_000)).toBe('2m')
  })

  test('hours, floored, once past 60 minutes', () => {
    expect(ageOf(0, 3 * 60 * 60_000)).toBe('3h')
  })

  test('days, floored, once past 24 hours', () => {
    expect(ageOf(0, 2 * 24 * 60 * 60_000)).toBe('2d')
  })

  test('createdAt after now (clock skew) still reads "now", never negative', () => {
    expect(ageOf(10_000, 0)).toBe('now')
  })
})

describe('statBarCells', () => {
  // The rounding rule (see stat-bar.tsx's doc comment): floor each side's proportional share,
  // then hand the one possible leftover cell first to a non-zero side that floored to nothing,
  // else to the larger fractional remainder, ties favouring added.
  test('an even split with a leftover cell goes to added (3,3,5 -> 3/2/0)', () => {
    expect(statBarCells(3, 3, 5)).toEqual({ added: 3, removed: 2, rest: 0 })
  })

  test('all added, nothing removed (10,0,5 -> 5/0/0)', () => {
    expect(statBarCells(10, 0, 5)).toEqual({ added: 5, removed: 0, rest: 0 })
  })

  test('a tiny non-zero side still gets one cell (1,100,5 -> 1/4/0)', () => {
    expect(statBarCells(1, 100, 5)).toEqual({ added: 1, removed: 4, rest: 0 })
  })

  test('the mirror: a tiny non-zero removed still gets one cell (100,1,5 -> 4/1/0)', () => {
    expect(statBarCells(100, 1, 5)).toEqual({ added: 4, removed: 1, rest: 0 })
  })

  test('removed wins a non-tied remainder (1,2,4 -> 1/3/0, removed has the larger fraction)', () => {
    expect(statBarCells(1, 2, 4)).toEqual({ added: 1, removed: 3, rest: 0 })
  })

  test('zero/zero draws all inactive (0,0,5 -> 0/0/5)', () => {
    expect(statBarCells(0, 0, 5)).toEqual({ added: 0, removed: 0, rest: 5 })
  })

  describe('scaled against a max (the file list, mirroring changeMapOf)', () => {
    test('a small change against a bigger max fills proportionally, split 1/1, rest inactive', () => {
      expect(statBarCells(1, 1, 5, 6)).toEqual({ added: 1, removed: 1, rest: 3 })
    })

    test('a change at the max fills every cell', () => {
      expect(statBarCells(3, 3, 5, 6)).toEqual({ added: 3, removed: 2, rest: 0 })
    })

    test('zero/zero still draws all inactive with a max given', () => {
      expect(statBarCells(0, 0, 5, 6)).toEqual({ added: 0, removed: 0, rest: 5 })
    })

    test('a changed file never floors to zero filled cells, even far below the max', () => {
      const bar = statBarCells(1, 0, 5, 1000)
      expect(bar.added + bar.removed).toBeGreaterThanOrEqual(1)
    })

    // `max = 0` already matched the no-`max` result before the `max <= 0` guard existed, by an
    // Infinity coincidence: `total / 0` is `Infinity` (total > 0), `Math.round` keeps it
    // `Infinity`, and `Math.min(safeCells, Math.max(1, Infinity))` clamps straight back down to
    // `safeCells`: the right answer for the wrong reason. `max = -1` is the real regression
    // check: without the guard, `total / -1` is negative, `Math.max(1, …)` floors it to `1`, and
    // `filled` collapses to `1` cell instead of `safeCells`: a visibly wrong bar the guard
    // actually fixes.
    test('a negative max is treated as no max (max = 0 passed even before the guard)', () => {
      expect(statBarCells(3, 3, 5, 0)).toEqual(statBarCells(3, 3, 5))
      expect(statBarCells(3, 3, 5, -1)).toEqual(statBarCells(3, 3, 5))
    })
  })
})

describe('progressCells', () => {
  test('3/5 of 5 cells fills 3', () => {
    expect(progressCells(3, 5, 5)).toBe(3)
  })

  test('0 total fills nothing', () => {
    expect(progressCells(0, 0, 5)).toBe(0)
  })

  test('done beyond total clamps to every cell', () => {
    expect(progressCells(8, 5, 5)).toBe(5)
  })
})

describe('changeMapOf', () => {
  test('the largest file draws the tallest glyph, a tenth of it the shortest', () => {
    const files = [fileOf('big.ts', 90, 10), fileOf('small.ts', 1, 0)]
    const cells = changeMapOf(files, new Set(), 10)
    expect(cells[0]?.glyph).toBe('█')
    expect(cells[1]?.glyph).toBe('▁')
  })

  test('a changed file never draws below ▁, even a tiny one next to a huge one', () => {
    const files = [fileOf('big.ts', 999, 0), fileOf('tiny.ts', 1, 0)]
    const cells = changeMapOf(files, new Set(), 10)
    expect(cells[1]?.glyph).toBe('▁')
  })

  test('colours by status, the rail colours', () => {
    const files = [fileOf('a.ts', 1, 0, 'added'), fileOf('b.ts', 1, 0, 'deleted')]
    const cells = changeMapOf(files, new Set(), 10)
    expect(cells[0]?.color).toBe(COLORS.added)
    expect(cells[1]?.color).toBe(COLORS.removed)
  })

  test('the file being edited this turn draws in the accent, overriding its status colour', () => {
    const files = [fileOf('a.ts', 1, 0, 'modified')]
    const cells = changeMapOf(files, new Set(['a.ts']), 10)
    expect(cells[0]?.color).toBe(COLORS.accent)
  })

  test('more files than maxCells keeps the first maxCells - 1 and ends with one dim "…" cell', () => {
    const files = [fileOf('a.ts', 1, 0), fileOf('b.ts', 1, 0), fileOf('c.ts', 1, 0)]
    const cells = changeMapOf(files, new Set(), 2)
    expect(cells.length).toBe(2)
    expect(cells[1]?.glyph).toBe('…')
  })

  test('no files draws no cells', () => {
    expect(changeMapOf([], new Set(), 10)).toEqual([])
  })
})

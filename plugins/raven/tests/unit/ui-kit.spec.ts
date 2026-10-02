import { describe, expect, test } from 'bun:test'
import { ageOf } from '../../hooks/ui/age'
import { progressCells } from '../../hooks/ui/progress-bar'
import { statBarCells } from '../../hooks/ui/stat-bar'

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

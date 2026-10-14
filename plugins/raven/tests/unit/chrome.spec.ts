import { describe, expect, test } from 'bun:test'
import {
  BAR_CELLS,
  BOXED_CELLS,
  groupCellsOf,
  NOTE_CELLS,
  openEndOf,
  openStartOf,
} from '../../hooks/ui/chrome'
import { ROUNDED_FRAME, SHARP_FRAME, styleOf } from '../../hooks/ui/style'

describe('groupCellsOf', () => {
  test('a bar takes its glyph and a space, a bare group nothing, a frame both sides', () => {
    expect(groupCellsOf(styleOf('bar'))).toBe(BAR_CELLS)
    expect(groupCellsOf(styleOf('none'))).toBe(0)
    expect(groupCellsOf(styleOf('sharp'))).toBe(BOXED_CELLS)
    expect(groupCellsOf(styleOf('rounded'))).toBe(BOXED_CELLS)
    expect(BAR_CELLS).toBe(2)
    expect(NOTE_CELLS).toBe(2)
  })
})

describe('openStartOf / openEndOf', () => {
  test('the top border opens `┌─ ` and closes `─┐` after pills, `┐` without', () => {
    expect(openStartOf(SHARP_FRAME)).toBe('┌─ ')
    expect(openEndOf(SHARP_FRAME, true)).toBe('─┐')
    expect(openEndOf(SHARP_FRAME, false)).toBe('┐')
    expect(openStartOf(ROUNDED_FRAME)).toBe('╭─ ')
    expect(openEndOf(ROUNDED_FRAME, true)).toBe('─╮')
  })
})

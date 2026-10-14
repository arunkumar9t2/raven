import { describe, expect, test } from 'bun:test'
import {
  COMPOSE_ACTION_CELLS,
  COMPOSE_INPUT_CELLS,
  COMPOSE_PICKER_CELLS,
  composeInnerWidthOf,
  composeLayoutOf,
  composePreviewCountOf,
  composePreviewLinesOf,
  composeRowsOf,
} from '../../hooks/views/diff/note-layout'

describe('composeLayoutOf', () => {
  // inline needs: [picker 24 + 1] + input 32 + 1 + actions 10
  const WITH_PICKER = COMPOSE_PICKER_CELLS + 1 + COMPOSE_INPUT_CELLS + 1 + COMPOSE_ACTION_CELLS
  const WITHOUT_PICKER = COMPOSE_INPUT_CELLS + 1 + COMPOSE_ACTION_CELLS

  test('no picker: one interior row when the Input and cancel fit beside each other', () => {
    expect(WITHOUT_PICKER).toBe(43)
    expect(composeLayoutOf(false, 43)).toEqual({ pickerRow: false, actionsRow: false, inner: 1 })
    expect(composeLayoutOf(false, 200)).toEqual({ pickerRow: false, actionsRow: false, inner: 1 })
  })

  test('no picker: the cancel pill wraps to a second row when it does not fit', () => {
    expect(composeLayoutOf(false, 42)).toEqual({ pickerRow: false, actionsRow: true, inner: 2 })
  })

  test('a picker is inline when everything fits one row', () => {
    expect(WITH_PICKER).toBe(68)
    expect(composeLayoutOf(true, 68)).toEqual({ pickerRow: false, actionsRow: false, inner: 1 })
  })

  test('a picker that does not fit moves to its own row above the Input', () => {
    expect(composeLayoutOf(true, 67)).toEqual({ pickerRow: true, actionsRow: false, inner: 2 })
    expect(composeLayoutOf(true, 43)).toEqual({ pickerRow: true, actionsRow: false, inner: 2 })
  })

  test('a very narrow box wraps both: picker row, Input row, cancel row', () => {
    expect(composeLayoutOf(true, 42)).toEqual({ pickerRow: true, actionsRow: true, inner: 3 })
  })
})

describe('composeRowsOf', () => {
  test('the box is its interior plus a top and a bottom border; width is the content width less the frame', () => {
    expect(composeRowsOf(false, 100)).toBe(3)
    expect(composeRowsOf(true, 100)).toBe(3)
    expect(composeRowsOf(true, 60)).toBe(4)
    expect(composeRowsOf(true, 40)).toBe(5)
    expect(composeRowsOf(false, 40)).toBe(4)
  })
})

describe('composePreviewLinesOf', () => {
  // no picker, 100 cells: the Input has 100 - 11 - 8 = 81 cells; with a picker, 81 - 25 = 56.
  test('text that fits the Input draws no preview', () => {
    expect(composePreviewLinesOf('', false, 100)).toEqual([])
    expect(composePreviewLinesOf('x'.repeat(80), false, 100)).toEqual([])
  })

  test('text just over the Input wraps to the interior less the two-column indent', () => {
    const text = `${'word '.repeat(20)}end`
    const lines = composePreviewLinesOf(text, false, 100)
    expect(lines.length).toBe(2)
    expect(lines.join(' ')).toBe(text)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(98)
  })

  test('a long unbroken word breaks hard', () => {
    const lines = composePreviewLinesOf('x'.repeat(200), false, 100)
    expect(lines).toEqual(['x'.repeat(98), 'x'.repeat(98), 'x'.repeat(4)])
  })

  test('past six lines the last six show, the first starting with an ellipsis', () => {
    const text = Array.from({ length: 10 }, (_, i) => String(i).repeat(98)).join('')
    const lines = composePreviewLinesOf(text, false, 100)
    expect(lines.length).toBe(6)
    expect(lines[0]?.startsWith('…')).toBe(true)
    expect(lines[0]?.length).toBe(98)
    expect(lines.at(-1)).toBe('9'.repeat(98))
  })

  test('an inline picker narrows the Input, so the threshold drops', () => {
    const text = 'x'.repeat(70)
    expect(composePreviewLinesOf(text, false, 100)).toEqual([])
    expect(composePreviewLinesOf(text, true, 100).length).toBe(1)
  })

  test('the box counts the preview rows', () => {
    const rows = (text: string) =>
      composeRowsOf(false, 100, composePreviewCountOf(text, false, composeInnerWidthOf(100)))
    expect(rows('x'.repeat(200))).toBe(composeRowsOf(false, 100) + 3)
    expect(rows('short')).toBe(composeRowsOf(false, 100))
  })

  test('a capped preview keeps the tail of its first row, so the seam into the next row is intact', () => {
    const words = Array.from({ length: 120 }, (_, i) => `word${String(i).padStart(3, '0')}`)
    const text = words.join(' ')
    const lines = composePreviewLinesOf(text, false, 100)
    expect(lines.length).toBe(6)
    const first = lines[0] as string
    expect(first.startsWith('…')).toBe(true)
    // Every shown row's characters are a contiguous run of the typed text, ending at its end.
    const shown = lines.map((line, i) => (i === 0 ? first.slice(1) : line)).join(' ')
    expect(text.endsWith(shown)).toBe(true)
  })

  test('the count equals the lines, and the cheap path skips wrapping', () => {
    const text = 'x'.repeat(200)
    expect(composePreviewCountOf(text, false, 96)).toBe(
      composePreviewLinesOf(text, false, 96).length,
    )
    expect(composePreviewCountOf('short', false, 96)).toBe(0)
  })

  test('the inner width is the columns less the frame, at least one', () => {
    expect(composeInnerWidthOf(100)).toBe(96)
    expect(composeInnerWidthOf(2)).toBe(1)
  })
})

import { describe, expect, test } from 'bun:test'
import {
  COMPOSE_ACTION_CELLS,
  COMPOSE_INPUT_CELLS,
  COMPOSE_PICKER_CELLS,
  composeLayoutOf,
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

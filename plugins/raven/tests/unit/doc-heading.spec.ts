import { describe, expect, test } from 'bun:test'
import { chipsWidthOf } from '../../hooks/ui/chips'
import { styleOf } from '../../hooks/ui/style'
import {
  HEADING_GAP,
  HEADING_TEXT_MIN,
  headingChipModeOf,
  headingLookOf,
  headingMarkCellsOf,
} from '../../hooks/views/doc-heading'

describe('headingLookOf', () => {
  test('bar: H1 and H2 get the bar mark and accent bold text, no rule', () => {
    for (const level of [1, 2]) {
      expect(headingLookOf(styleOf('bar'), level)).toEqual({
        mark: '▌',
        accent: true,
        dim: false,
        rule: false,
      })
    }
  })

  test('none, sharp and rounded: H1 and H2 have no mark and a dim rule under them', () => {
    for (const name of ['none', 'sharp', 'rounded'] as const) {
      for (const level of [1, 2]) {
        expect(headingLookOf(styleOf(name), level)).toEqual({
          mark: null,
          accent: true,
          dim: false,
          rule: true,
        })
      }
    }
  })

  test('H3 and deeper are bold only, in every style', () => {
    for (const name of ['bar', 'none', 'sharp', 'rounded'] as const) {
      for (const level of [3, 4, 5, 6]) {
        expect(headingLookOf(styleOf(name), level)).toEqual({
          mark: null,
          accent: false,
          dim: false,
          rule: false,
        })
      }
    }
  })

  test('the top section (level 0) is a dim, plain row', () => {
    expect(headingLookOf(styleOf('bar'), 0)).toEqual({
      mark: null,
      accent: false,
      dim: true,
      rule: false,
    })
  })

  test('the mark takes two cells (glyph and space), none takes zero', () => {
    expect(headingMarkCellsOf(headingLookOf(styleOf('bar'), 1))).toBe(2)
    expect(headingMarkCellsOf(headingLookOf(styleOf('bar'), 3))).toBe(0)
  })
})

describe('headingChipModeOf', () => {
  const chip = { icon: '✎', label: 'note' }
  // Room the chip needs in words mode, plus what the row reserves around it.
  const edge = 1
  const exact = (markCells: number, headingCells: number) =>
    chipsWidthOf([chip]) + HEADING_GAP + Math.min(headingCells, HEADING_TEXT_MIN) + markCells + edge

  test('keeps its words when the chip fits beside at least the least heading', () => {
    expect(headingChipModeOf(exact(2, 40), 2, 40, chip)).toBe('words')
    expect(headingChipModeOf(exact(2, 40) + 20, 2, 40, chip)).toBe('words')
  })

  test('drops to its icon one cell before it would not fit', () => {
    expect(headingChipModeOf(exact(2, 40) - 1, 2, 40, chip)).toBe('icons')
  })

  test('a short heading asks for only its own width', () => {
    expect(headingChipModeOf(exact(2, 5), 2, 5, chip)).toBe('words')
    expect(headingChipModeOf(exact(2, 5) - 1, 2, 5, chip)).toBe('icons')
  })
})

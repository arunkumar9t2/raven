import { describe, expect, test } from 'bun:test'
import { ICON_GAP, iconText, NOTE_GLYPH } from '../../hooks/ui/icon-text'
import { widthOf } from '../../hooks/ui/wrap'
import {
  type HeaderPlanInput,
  headerChipsOf,
  headerPlanOf,
  MIN_MAP_CELLS,
} from '../../hooks/views/diff/header-plan'

const input = (patch: Partial<HeaderPlanInput> = {}): HeaderPlanInput => ({
  columns: 120,
  fileCount: 5,
  adds: 22,
  dels: 3,
  pending: 2,
  confirmingClear: false,
  sourceLabel: 'HEAD',
  canPick: true,
  ...patch,
})

describe('headerChipsOf', () => {
  test('nav, refresh, edit & send, send and clear, with the shrink priorities the header relies on', () => {
    const chips = headerChipsOf({ pending: 2, confirmingClear: false, includeRefresh: true })
    expect(chips.map(chip => chip.key)).toEqual([
      'previous',
      'next',
      'refresh',
      'edit-send',
      'send',
      'clear',
    ])
    const priorityOf = (key: string) => chips.find(chip => chip.key === key)?.priority
    expect(priorityOf('previous')).toBe(0)
    expect(priorityOf('refresh')).toBe(1)
    expect(priorityOf('clear')).toBe(2)
    expect(priorityOf('edit-send')).toBe(3)
    expect(priorityOf('send')).toBe(4)
  })

  test('with nothing pending there is no send; refresh can be left out', () => {
    const chips = headerChipsOf({ pending: 0, confirmingClear: false, includeRefresh: false })
    expect(chips.map(chip => chip.key)).toEqual(['previous', 'next', 'clear'])
  })

  test('an armed clear drops nav and refresh and keeps its own words', () => {
    const chips = headerChipsOf({ pending: 0, confirmingClear: true, includeRefresh: true })
    expect(chips.map(chip => chip.key)).toEqual(['clear'])
    expect(chips[0]).toMatchObject({ label: 'clear all?', kind: 'armed', forceWords: true })
  })

  test('the send chip carries the count even as a bare icon', () => {
    const chips = headerChipsOf({ pending: 3, confirmingClear: false, includeRefresh: true })
    expect(chips.find(chip => chip.key === 'send')?.short).toBe(iconText('➤', '3'))
  })
})

describe('headerPlanOf', () => {
  test('a wide pane is one row with the full map and the notes summary', () => {
    expect(headerPlanOf(input({ columns: 120 }))).toEqual({
      rows: 1,
      mapCells: 5,
      notesText: iconText(NOTE_GLYPH, '2 notes pending'),
      leftCells: 61 + widthOf(ICON_GAP),
    })
  })

  test('a medium pane is still one row, with the map at its floor and no notes summary', () => {
    expect(headerPlanOf(input({ columns: 80 }))).toEqual({
      rows: 1,
      mapCells: MIN_MAP_CELLS,
      notesText: '',
      leftCells: 40,
    })
  })

  test('a pane too narrow for the counts, the picker and the chips as icons falls back to two rows', () => {
    expect(headerPlanOf(input({ columns: 60 })).rows).toBe(2)
    expect(headerPlanOf(input({ columns: 38 })).rows).toBe(2)
  })

  test('the map is capped at 12 cells in the one-row form', () => {
    const plan = headerPlanOf(input({ columns: 200, fileCount: 40 }))
    expect(plan).toMatchObject({ rows: 1, mapCells: 12 })
  })

  test('a long turn label counts for at most 24 cells of the picker', () => {
    const long = headerPlanOf(input({ columns: 200, sourceLabel: 'turn 3: '.padEnd(60, 'x') }))
    const capped = headerPlanOf(input({ columns: 200, sourceLabel: 'x'.repeat(24) }))
    expect(long).toEqual(capped)
  })

  test('a surface without a picker draws source buttons (about 40 cells), which need more room for one row', () => {
    expect(headerPlanOf(input({ columns: 90, canPick: false })).rows).toBe(2)
    expect(headerPlanOf(input({ columns: 100, canPick: false })).rows).toBe(1)
  })

  test('no files draws no map', () => {
    expect(headerPlanOf(input({ fileCount: 0, adds: 0, dels: 0, pending: 0 }))).toMatchObject({
      rows: 1,
      mapCells: 0,
    })
  })
})

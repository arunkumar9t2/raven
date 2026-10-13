import { describe, expect, test } from 'bun:test'
import { chipsLayout, chipText, pillWidthOf } from '../../hooks/ui/chips'
import { ICON_GAP, iconText, NOTE_GLYPH } from '../../hooks/ui/icon-text'
import { widthOf } from '../../hooks/ui/wrap'
import {
  type HeaderPlanInput,
  headerChipsOf,
  headerPlanOf,
  MIN_MAP_CELLS,
  sourceLabelOf,
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

describe('headerPlanOf with an armed clear', () => {
  const armed = (columns: number) =>
    input({ columns, fileCount: 5, pending: 1, confirmingClear: true })

  test('the armed "clear all?" pill keeps its words, so the one-row floor counts it at that width', () => {
    // edit & send and send stay as bare icons (`<note glyph>`, `➤ 1`); the armed clear keeps its words.
    const floor = pillWidthOf(NOTE_GLYPH) + 1 + pillWidthOf('➤ 1') + 1 + pillWidthOf('⌫ clear all?')
    const first = Array.from({ length: 171 }, (_, i) => i + 30).find(
      columns => headerPlanOf(armed(columns)).rows === 1,
    )
    expect(first).toBeDefined()
    const plan = headerPlanOf(armed(first ?? 0))
    if (plan.rows !== 1) throw new Error('expected one row')
    expect(first).toBe(plan.leftCells + 2 + floor)
    expect(headerPlanOf(armed((first ?? 0) - 1)).rows).toBe(2)
  })

  test('whenever the plan is one row, the chips fit the room the left cluster leaves', () => {
    for (const pending of [0, 1, 12, 123]) {
      for (const sourceLabel of ['HEAD', `turn 12: ${'x'.repeat(51)}`]) {
        for (let columns = 30; columns <= 200; columns++) {
          const plan = headerPlanOf(
            input({ columns, pending, sourceLabel, confirmingClear: true, adds: 0, dels: 0 }),
          )
          if (plan.rows !== 1) continue
          const chips = headerChipsOf({ pending, confirmingClear: true, includeRefresh: true })
          const room = Math.max(0, columns - plan.leftCells - 2)
          const modes = chipsLayout(chips, room)
          const width =
            chips.reduce(
              (sum, chip, i) => sum + pillWidthOf(chipText(chip, modes[i] ?? 'icons')),
              0,
            ) +
            chips.length -
            1
          expect(width).toBeLessThanOrEqual(room)
        }
      }
    }
  })
})

describe('sourceLabelOf', () => {
  test('a label within 24 cells is drawn as it is', () => {
    expect(sourceLabelOf('HEAD')).toBe('HEAD')
    expect(sourceLabelOf('x'.repeat(24))).toBe('x'.repeat(24))
  })

  test('a longer label is cut to 24 cells with a trailing ellipsis, so the drawn width is the counted width', () => {
    const cut = sourceLabelOf(`turn 12: ${'Refactor the authentication middleware '.repeat(2)}`)
    expect(widthOf(cut)).toBe(24)
    expect(cut.endsWith('…')).toBe(true)
    // Wide characters never overshoot the cap.
    expect(widthOf(sourceLabelOf('漢'.repeat(40)))).toBeLessThanOrEqual(24)
  })
})

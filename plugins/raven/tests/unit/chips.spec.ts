import { describe, expect, test } from 'bun:test'
import { type Chip, chipsFit, chipsIconsWidthOf, chipsLayout } from '../../hooks/ui/chips'

const noop = () => {}

/** A minimal `Chip` for `chipsLayout`, defaulting `onPress` so each test only states what it tests. */
const chipOf = (partial: Partial<Chip> & Pick<Chip, 'key' | 'icon' | 'label'>): Chip => ({
  onPress: noop,
  ...partial,
})

const TOOLBAR = [
  { icon: '✎', label: 'note' },
  { icon: '✓', label: 'stage' },
  { icon: '↺', label: 'revert' },
]

describe('chipsFit', () => {
  test('words when the note, stage and revert pills fit', () => {
    // 8 + 1 + 9 + 1 + 10 = 29
    expect(chipsFit(TOOLBAR, 29)).toBe('words')
  })
  test('icons one column short of that', () => {
    expect(chipsFit(TOOLBAR, 28)).toBe('icons')
  })
  test('no chips fit anything', () => {
    expect(chipsFit([], 0)).toBe('words')
  })

  test('an icon-only or label-only chip still fits by its one real word (no stray space)', () => {
    // a pill is its text plus 2 padding cells: '✕' = 3, 'resend' = 8; +1 gap = 12.
    expect(
      chipsFit(
        [
          { icon: '✕', label: '' },
          { icon: '', label: 'resend' },
        ],
        12,
      ),
    ).toBe('words')
    expect(
      chipsFit(
        [
          { icon: '✕', label: '' },
          { icon: '', label: 'resend' },
        ],
        11,
      ),
    ).toBe('icons')
  })
})

describe('chipsLayout', () => {
  // Three chips, same shape, distinguished only by `priority`: a pill of 'x xxxx' is 8
  // cells in words, 'x' is 3 in icons. Total words width = 3*8 + 2 gaps = 26.
  const CHIPS: readonly Chip[] = [
    chipOf({ key: 'a', icon: 'a', label: 'aaaa', priority: 2 }),
    chipOf({ key: 'b', icon: 'b', label: 'bbbb', priority: 0 }),
    chipOf({ key: 'c', icon: 'c', label: 'cccc', priority: 1 }),
  ]

  test('everything fits: every chip stays words', () => {
    expect(chipsLayout(CHIPS, 26)).toEqual(['words', 'words', 'words'])
  })

  test('one short of fitting: the lowest-priority chip (b, priority 0) shrinks alone', () => {
    // 26 - (8 - 3) = 21 <= 25.
    expect(chipsLayout(CHIPS, 25)).toEqual(['words', 'icons', 'words'])
  })

  test('tighter still: priority 0 then priority 1 shrink, in that order', () => {
    // 21 - 5 = 16 <= 17.
    expect(chipsLayout(CHIPS, 17)).toEqual(['words', 'icons', 'icons'])
  })

  test('the highest-priority chip shrinks too, as a last resort, once nothing else can help', () => {
    // Fully shrunk: 3*3 + 2 gaps = 11, still short of 10; every chip ends up in icons mode
    // rather than leaving the row over its room with one chip left in words.
    expect(chipsLayout(CHIPS, 10)).toEqual(['icons', 'icons', 'icons'])
  })

  test('a forceWords chip is never shrunk, even as the lowest priority', () => {
    const chips: readonly Chip[] = [
      chipOf({ key: 'a', icon: 'a', label: 'aaaa', priority: 2 }),
      chipOf({ key: 'b', icon: 'b', label: 'bbbb', priority: 0, forceWords: true }),
      chipOf({ key: 'c', icon: 'c', label: 'cccc', priority: 1 }),
    ]
    // b can't shrink, so c (priority 1) goes next instead: 26 - (8 - 3) = 21 <= 25.
    expect(chipsLayout(chips, 25)).toEqual(['words', 'words', 'icons'])
  })

  test('no chips lays out nothing', () => {
    expect(chipsLayout([], 0)).toEqual([])
  })
})

describe('chipsIconsWidthOf', () => {
  test('pads each bare icon (or short) as a pill, one gap between', () => {
    expect(chipsIconsWidthOf([])).toBe(0)
    expect(chipsIconsWidthOf([{ icon: '✎' }])).toBe(3)
    expect(chipsIconsWidthOf([{ icon: '✎' }, { icon: '➤', short: '➤ 2' }])).toBe(3 + 1 + 5)
  })
})

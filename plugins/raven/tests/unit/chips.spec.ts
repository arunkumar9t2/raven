import { describe, expect, test } from 'bun:test'
import { type Chip, chipsFit, chipsLayout } from '../../hooks/ui/chips'

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
  test('words when [ ✎ note ] [ ✓ stage ] [ ↺ revert ] fits', () => {
    // 10 + 1 + 11 + 1 + 12 = 35
    expect(chipsFit(TOOLBAR, 35)).toBe('words')
  })
  test('icons one column short of that', () => {
    expect(chipsFit(TOOLBAR, 34)).toBe('icons')
  })
  test('no chips fit anything', () => {
    expect(chipsFit([], 0)).toBe('words')
  })

  test('an icon-only or label-only chip still fits by its one real word (no stray space)', () => {
    // buttonWidthOf('✕') = 1 + 4 = 5; buttonWidthOf('resend') = 6 + 4 = 10; +1 gap = 16.
    expect(
      chipsFit(
        [
          { icon: '✕', label: '' },
          { icon: '', label: 'resend' },
        ],
        16,
      ),
    ).toBe('words')
    expect(
      chipsFit(
        [
          { icon: '✕', label: '' },
          { icon: '', label: 'resend' },
        ],
        15,
      ),
    ).toBe('icons')
  })
})

describe('chipsLayout', () => {
  // Three chips, same shape, distinguished only by `priority`: `buttonWidthOf('x xxxx')` = 10
  // in words, `buttonWidthOf('x')` = 5 in icons. Total words width = 3*10 + 2 gaps = 32.
  const CHIPS: readonly Chip[] = [
    chipOf({ key: 'a', icon: 'a', label: 'aaaa', priority: 2 }),
    chipOf({ key: 'b', icon: 'b', label: 'bbbb', priority: 0 }),
    chipOf({ key: 'c', icon: 'c', label: 'cccc', priority: 1 }),
  ]

  test('everything fits: every chip stays words', () => {
    expect(chipsLayout(CHIPS, 32)).toEqual(['words', 'words', 'words'])
  })

  test('one short of fitting: the lowest-priority chip (b, priority 0) shrinks alone', () => {
    // 32 - (10 - 5) = 27 <= 28.
    expect(chipsLayout(CHIPS, 28)).toEqual(['words', 'icons', 'words'])
  })

  test('tighter still: priority 0 then priority 1 shrink, in that order', () => {
    // 27 - 5 = 22 <= 22.
    expect(chipsLayout(CHIPS, 22)).toEqual(['words', 'icons', 'icons'])
  })

  test('the highest-priority chip shrinks too, as a last resort, once nothing else can help', () => {
    // Fully shrunk: 5*3 + 2 gaps = 17, still short of 16 — every chip ends up in icons mode
    // rather than leaving the row over its room with one chip left in words.
    expect(chipsLayout(CHIPS, 16)).toEqual(['icons', 'icons', 'icons'])
  })

  test('a forceWords chip is never shrunk, even as the lowest priority', () => {
    const chips: readonly Chip[] = [
      chipOf({ key: 'a', icon: 'a', label: 'aaaa', priority: 2 }),
      chipOf({ key: 'b', icon: 'b', label: 'bbbb', priority: 0, forceWords: true }),
      chipOf({ key: 'c', icon: 'c', label: 'cccc', priority: 1 }),
    ]
    // b can't shrink, so c (priority 1) goes next instead: 32 - (10 - 5) = 27 <= 28.
    expect(chipsLayout(chips, 28)).toEqual(['words', 'words', 'icons'])
  })

  test('no chips lays out nothing', () => {
    expect(chipsLayout([], 0)).toEqual([])
  })
})

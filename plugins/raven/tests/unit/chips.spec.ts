import { describe, expect, test } from 'bun:test'
import { chipsFit } from '../../hooks/ui/chips'

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
})

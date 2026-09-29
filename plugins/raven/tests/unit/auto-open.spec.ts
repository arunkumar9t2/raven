import { describe, expect, test } from 'bun:test'
import { shouldAutoOpen } from '../../hooks/core/auto-open'
import { DEFAULT_SETTINGS } from '../../hooks/core/settings'

describe('shouldAutoOpen', () => {
  test('opens by default with an unmeasured width', () => {
    expect(shouldAutoOpen(DEFAULT_SETTINGS, undefined)).toBe(true)
  })

  test('autoOpen: false never opens, whatever the width', () => {
    const settings = { ...DEFAULT_SETTINGS, autoOpen: false }
    expect(shouldAutoOpen(settings, undefined)).toBe(false)
    expect(shouldAutoOpen(settings, 500)).toBe(false)
  })

  test('a width below autoOpenColumns skips the open', () => {
    const settings = { ...DEFAULT_SETTINGS, autoOpenColumns: 144 }
    expect(shouldAutoOpen(settings, 100)).toBe(false)
  })

  test('a width at or above autoOpenColumns opens', () => {
    const settings = { ...DEFAULT_SETTINGS, autoOpenColumns: 144 }
    expect(shouldAutoOpen(settings, 144)).toBe(true)
    expect(shouldAutoOpen(settings, 200)).toBe(true)
  })

  test('an unmeasured width opens even with a high autoOpenColumns', () => {
    expect(shouldAutoOpen({ ...DEFAULT_SETTINGS, autoOpenColumns: 500 }, undefined)).toBe(true)
  })
})

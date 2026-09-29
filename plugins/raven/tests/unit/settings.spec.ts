import { describe, expect, test } from 'bun:test'
import { DEFAULT_SETTINGS, settingsOf } from '../../hooks/core/settings'

describe('settingsOf', () => {
  test('every field defaults when options is empty', () => {
    expect(settingsOf({})).toEqual(DEFAULT_SETTINGS)
  })

  test('parses a well-typed options object', () => {
    expect(
      settingsOf({ watchedPaths: 'notes/, docs/adr', autoOpen: false, autoOpenColumns: 80 }),
    ).toEqual({
      watchedPaths: ['notes/', 'docs/adr'],
      autoOpen: false,
      autoOpenColumns: 80,
    })
  })

  test('drops empty and blank fragments', () => {
    expect(settingsOf({ watchedPaths: ' notes/ ,, docs/ ' }).watchedPaths).toEqual([
      'notes/',
      'docs/',
    ])
  })

  test('a watchedPaths of only commas falls back to the default', () => {
    expect(settingsOf({ watchedPaths: ' , ,' }).watchedPaths).toEqual(DEFAULT_SETTINGS.watchedPaths)
  })

  test('a wrong-typed field falls back to its default, others still parse', () => {
    expect(settingsOf({ watchedPaths: 42, autoOpen: 'yes', autoOpenColumns: '80' })).toEqual(
      DEFAULT_SETTINGS,
    )
  })

  test('a non-finite or non-positive autoOpenColumns falls back to the default', () => {
    expect(settingsOf({ autoOpenColumns: 0 }).autoOpenColumns).toBe(
      DEFAULT_SETTINGS.autoOpenColumns,
    )
    expect(settingsOf({ autoOpenColumns: -5 }).autoOpenColumns).toBe(
      DEFAULT_SETTINGS.autoOpenColumns,
    )
    expect(settingsOf({ autoOpenColumns: Number.NaN }).autoOpenColumns).toBe(
      DEFAULT_SETTINGS.autoOpenColumns,
    )
  })
})

import { describe, expect, test } from 'bun:test'
import { DEFAULT_SETTINGS, settingsOf } from '../../hooks/core/settings'

describe('settingsOf', () => {
  test('keyboardControls is off by default and parses a boolean', () => {
    expect(settingsOf({}).keyboardControls).toBe(false)
    expect(settingsOf({ keyboardControls: true }).keyboardControls).toBe(true)
    expect(settingsOf({ keyboardControls: 'yes' }).keyboardControls).toBe(false)
  })

  test('every field defaults when options is empty', () => {
    expect(settingsOf({})).toEqual(DEFAULT_SETTINGS)
  })

  test('parses a well-typed options object', () => {
    expect(
      settingsOf({
        watchedPaths: 'notes/, docs/adr',
        autoOpen: false,
        autoOpenColumns: 80,
        cardStyle: 'rounded',
        splitColumns: 120,
        paneBackground: ' #101315 ',
      }),
    ).toEqual({
      watchedPaths: ['notes/', 'docs/adr'],
      autoOpen: false,
      autoOpenColumns: 80,
      keyboardControls: false,
      cardStyle: 'rounded',
      splitColumns: 120,
      paneBackground: '#101315',
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

  test('cardStyle defaults to bar and accepts the four names', () => {
    expect(settingsOf({}).cardStyle).toBe('bar')
    for (const name of ['bar', 'none', 'sharp', 'rounded'] as const) {
      expect(settingsOf({ cardStyle: name }).cardStyle).toBe(name)
    }
  })

  test('an unknown or wrong-typed cardStyle falls back to bar', () => {
    expect(settingsOf({ cardStyle: 'square' }).cardStyle).toBe('bar')
    expect(settingsOf({ cardStyle: 'Rounded' }).cardStyle).toBe('bar')
  })

  test('cardStyle is trimmed, like paneBackground', () => {
    expect(settingsOf({ cardStyle: ' sharp ' }).cardStyle).toBe('sharp')
    expect(settingsOf({ cardStyle: '\tnone\n' }).cardStyle).toBe('none')
    expect(settingsOf({ cardStyle: '   ' }).cardStyle).toBe('bar')
  })

  test('paneBackground accepts any identifier as an open-ended theme key; the engine resolves it', () => {
    expect(settingsOf({ paneBackground: 'userMessageBackground' }).paneBackground).toBe(
      'userMessageBackground',
    )
    expect(settingsOf({ paneBackground: 'banana' }).paneBackground).toBe('banana')
    expect(settingsOf({ paneBackground: 'not a key!' }).paneBackground).toBe('')
    expect(settingsOf({ cardStyle: 3 }).cardStyle).toBe('bar')
    expect(settingsOf({ cardStyle: true }).cardStyle).toBe('bar')
  })

  test('splitColumns defaults to 160 and takes a positive finite number', () => {
    expect(DEFAULT_SETTINGS.splitColumns).toBe(160)
    expect(settingsOf({}).splitColumns).toBe(160)
    expect(settingsOf({ splitColumns: 100 }).splitColumns).toBe(100)
  })

  test('a non-finite, non-positive or wrong-typed splitColumns falls back to 160', () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '120']) {
      expect(settingsOf({ splitColumns: bad }).splitColumns).toBe(160)
    }
  })

  test('paneBackground defaults to empty and keeps a trimmed string', () => {
    expect(DEFAULT_SETTINGS.paneBackground).toBe('')
    expect(settingsOf({}).paneBackground).toBe('')
    expect(settingsOf({ paneBackground: '#101315' }).paneBackground).toBe('#101315')
    expect(settingsOf({ paneBackground: '  #101315  ' }).paneBackground).toBe('#101315')
  })

  test('hex, rgb() and theme-key colours are kept; anything else falls back to empty', () => {
    for (const good of ['#101315', '#abc', '#ABCDEF', 'rgb(16, 19, 21)', 'userMessageBackground']) {
      expect(settingsOf({ paneBackground: good }).paneBackground).toBe(good)
    }
    for (const bad of ['101315', '#12345', 'blue-ish', 'rgb(300,0,0)']) {
      expect(settingsOf({ paneBackground: bad }).paneBackground).toBe('')
    }
  })

  test('a blank or wrong-typed paneBackground falls back to empty', () => {
    for (const bad of ['  ', '', 3, true]) {
      expect(settingsOf({ paneBackground: bad }).paneBackground).toBe('')
    }
  })
})

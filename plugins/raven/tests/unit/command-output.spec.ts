import { describe, expect, test } from 'bun:test'
import { commandGlyphOf } from '../../hooks/core/command-glyph'

describe('commandGlyphOf', () => {
  test('a pane shown', () => {
    expect(commandGlyphOf('shown')).toBe('◆')
  })

  test('a pane hidden', () => {
    expect(commandGlyphOf('hidden')).toBe('◇')
  })

  test('the terminal too narrow to dock', () => {
    expect(commandGlyphOf('narrow')).toBe('!')
  })

  test('a thrown command error or unknown usage', () => {
    expect(commandGlyphOf('error')).toBe('!')
  })

  test('an unrecognised row falls back to the neutral glyph', () => {
    expect(commandGlyphOf('info')).toBe('◆')
  })
})

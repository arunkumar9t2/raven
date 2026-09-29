import { describe, expect, test } from 'bun:test'
import { commandGlyphOf } from '../../hooks/core/command-glyph'

describe('commandGlyphOf', () => {
  test('a pane shown', () => {
    expect(commandGlyphOf('Raven diff shown', false)).toBe('◆')
  })

  test('a pane hidden', () => {
    expect(commandGlyphOf('Raven diff hidden', false)).toBe('◇')
  })

  test('the terminal too narrow to dock', () => {
    expect(commandGlyphOf('Widen the terminal to dock the Raven pane', false)).toBe('!')
  })

  test('a thrown command error, by isErrored', () => {
    expect(commandGlyphOf('Raven failed: boom', true)).toBe('!')
  })

  test('unrecognised usage help', () => {
    expect(commandGlyphOf('Usage: /raven [diff|doc|send]', false)).toBe('!')
  })

  test('the review sent', () => {
    expect(commandGlyphOf('Review sent', false)).toBe('◆')
  })

  test('no comments to send', () => {
    expect(commandGlyphOf('No review comments to send', false)).toBe('◇')
  })
})

import { describe, expect, test } from 'bun:test'
import { ICON_GAP, iconText, NOTE_GLYPH } from '../../hooks/ui/icon-text'

describe('iconText', () => {
  test('joins the glyph and the text with the one icon gap', () => {
    expect(iconText(NOTE_GLYPH, 'note')).toBe(`${NOTE_GLYPH}${ICON_GAP}note`)
  })

  test('is one space until the Phase 0 icon-width probe says otherwise', () => {
    expect(ICON_GAP).toBe(' ')
    expect(iconText(NOTE_GLYPH, 'note')).toBe(`${NOTE_GLYPH}${ICON_GAP}note`)
  })

  test('an empty side leaves no stray gap', () => {
    expect(iconText('✕', '')).toBe('✕')
    expect(iconText('', 'resend')).toBe('resend')
    expect(iconText('', '')).toBe('')
  })
})

describe('NOTE_GLYPH', () => {
  test('is nf-md-message_text_outline (U+F036A)', () => {
    expect(NOTE_GLYPH).toBe('\u{f036a}')
  })
})

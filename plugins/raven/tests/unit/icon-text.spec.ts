import { describe, expect, test } from 'bun:test'
import { ICON_GAP, iconText } from '../../hooks/ui/icon-text'

describe('iconText', () => {
  test('joins the glyph and the text with the one icon gap', () => {
    expect(iconText('✎', 'note')).toBe(`✎${ICON_GAP}note`)
  })

  test('is one space until the Phase 0 icon-width probe says otherwise', () => {
    expect(ICON_GAP).toBe(' ')
    expect(iconText('✎', 'note')).toBe(`✎${ICON_GAP}note`)
  })

  test('an empty side leaves no stray gap', () => {
    expect(iconText('✕', '')).toBe('✕')
    expect(iconText('', 'resend')).toBe('resend')
    expect(iconText('', '')).toBe('')
  })
})

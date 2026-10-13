import { describe, expect, test } from 'bun:test'
import {
  CARD_STYLES,
  isCardStyle,
  NOTE_BAR,
  ROUNDED_FRAME,
  SHARP_FRAME,
  styleOf,
} from '../../hooks/ui/style'

describe('styleOf', () => {
  test('bar: a left bar, no frame, no title rule, a header-rule table, sharp compose box', () => {
    expect(styleOf('bar')).toEqual({
      cardStyle: 'bar',
      group: '▌',
      frame: null,
      titleRule: false,
      compose: SHARP_FRAME,
      table: 'rule',
      tableCorners: 'sharp',
    })
  })

  test('none: no mark at all, a rule under the title, a header-rule table', () => {
    expect(styleOf('none')).toEqual({
      cardStyle: 'none',
      group: null,
      frame: null,
      titleRule: true,
      compose: SHARP_FRAME,
      table: 'rule',
      tableCorners: 'sharp',
    })
  })

  test('sharp: one closed ┌┐└┘ frame and a sharp grid', () => {
    expect(styleOf('sharp')).toEqual({
      cardStyle: 'sharp',
      group: null,
      frame: SHARP_FRAME,
      titleRule: false,
      compose: SHARP_FRAME,
      table: 'grid',
      tableCorners: 'sharp',
    })
  })

  test('rounded: ╭╮╰╯ frame, compose box and grid corners', () => {
    expect(styleOf('rounded')).toEqual({
      cardStyle: 'rounded',
      group: null,
      frame: ROUNDED_FRAME,
      titleRule: false,
      compose: ROUNDED_FRAME,
      table: 'grid',
      tableCorners: 'rounded',
    })
  })

  test('the frames are the glyphs the spec names', () => {
    expect(SHARP_FRAME).toEqual({ tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' })
    expect(ROUNDED_FRAME).toEqual({ tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' })
    expect(NOTE_BAR).toBe('┃')
  })

  test('only a frame style has a frame, and only bar has a group mark', () => {
    for (const name of CARD_STYLES) {
      const style = styleOf(name)
      expect(style.frame !== null).toBe(name === 'sharp' || name === 'rounded')
      expect(style.group !== null).toBe(name === 'bar')
      expect(style.titleRule).toBe(name === 'none')
    }
  })
})

describe('isCardStyle', () => {
  test('accepts the four names and nothing else', () => {
    for (const name of ['bar', 'none', 'sharp', 'rounded']) expect(isCardStyle(name)).toBe(true)
    for (const bad of ['Bar', 'square', '', 3, null, undefined])
      expect(isCardStyle(bad)).toBe(false)
  })
})

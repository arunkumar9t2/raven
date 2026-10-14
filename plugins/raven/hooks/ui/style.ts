/**
 * The border style, as data: one `Style` per `cardStyle` setting, read by every pane through
 * `kit.style` so no view carries a box glyph of its own. Pure, no imports: it loads in the mod
 * sandbox and under bun alike.
 */

export type CardStyle = 'bar' | 'none' | 'sharp' | 'rounded'

export const CARD_STYLES: readonly CardStyle[] = ['bar', 'none', 'sharp', 'rounded']

export const isCardStyle = (value: unknown): value is CardStyle =>
  typeof value === 'string' && (CARD_STYLES as readonly string[]).includes(value)

/** The six glyphs of a closed frame: four corners, the horizontal and the vertical. */
export type Frame = { tl: string; tr: string; bl: string; br: string; h: string; v: string }

export const SHARP_FRAME: Frame = { tl: '┌', tr: '┐', bl: '└', br: '┘', h: '─', v: '│' }
export const ROUNDED_FRAME: Frame = { tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│' }

/** A note's bar, the same in every style: drawn in the note's state colour. */
export const NOTE_BAR = '┃'

export type Style = {
  cardStyle: CardStyle
  /** The left mark drawn per body row of a group (file card, doc section); `bar` only. */
  group: string | null
  /** The closed frame around a group; `sharp` and `rounded` only. */
  frame: Frame | null
  /** A dim `─` rule row under a title; `none` only. */
  titleRule: boolean
  /** The compose box's frame: always closed, rounded only under `rounded`. */
  compose: Frame
  /** `rule`: header and one rule, no verticals. `grid`: the full boxed grid. */
  table: 'rule' | 'grid'
  /** The outer corners of a `grid` table. */
  tableCorners: 'sharp' | 'rounded'
}

const STYLES: Record<CardStyle, Style> = {
  bar: {
    cardStyle: 'bar',
    group: '▌',
    frame: null,
    titleRule: false,
    compose: SHARP_FRAME,
    table: 'rule',
    tableCorners: 'sharp',
  },
  none: {
    cardStyle: 'none',
    group: null,
    frame: null,
    titleRule: true,
    compose: SHARP_FRAME,
    table: 'rule',
    tableCorners: 'sharp',
  },
  sharp: {
    cardStyle: 'sharp',
    group: null,
    frame: SHARP_FRAME,
    titleRule: false,
    compose: SHARP_FRAME,
    table: 'grid',
    tableCorners: 'sharp',
  },
  rounded: {
    cardStyle: 'rounded',
    group: null,
    frame: ROUNDED_FRAME,
    titleRule: false,
    compose: ROUNDED_FRAME,
    table: 'grid',
    tableCorners: 'rounded',
  },
}

export function styleOf(cardStyle: CardStyle): Style {
  return STYLES[cardStyle]
}

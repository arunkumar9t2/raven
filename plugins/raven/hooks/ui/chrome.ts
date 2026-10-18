/**
 * The cells Raven's chrome takes, in one place: every width calculation that subtracts a border,
 * a gutter or a rule's own glyphs reads them from here rather than carrying a number of its own.
 */

import type { Frame, Style } from './style'

/** What a boxed card's side borders take of its width: `│ ` on the left, ` │` on the right. */
export const BOXED_CELLS = 4

/** Columns the engine keeps at the `AbovePrompt` band's right edge (it draws its own marker there). */
export const BAND_GUTTER = 3

/** The Doc pane's inset: blank cells on each side of its content, so the body never touches the pane's border. */
export const DOC_GUTTER = 2

/** The Doc pane's blank rows above its content. */
export const DOC_TOP = 1

/** The band's room beside its pills: the mark, the summary and the gap, before `chipsLayout` shrinks them. */
export const BAND_LABEL_CELLS = 24

/** A rule's own cells beside its title: the opening glyphs (3), the gap before the fill (1) and one fill cell. */
const RULE_CHROME_CELLS = 5

/** A bar-style group's left rail: the `▌` or `┃` glyph and a space. */
export const BAR_CELLS = 2

/** A note card's `┃ ` bar column. */
export const NOTE_CELLS = 2

/** What a style's group rails take of the pane width: a bar 2, a bare group 0, a frame 4 (both sides). */
export const groupCellsOf = (style: Style): number =>
  style.frame ? BOXED_CELLS : style.group ? BAR_CELLS : 0

/** A frame's top border opening, space included: `┌─ ` / `╭─ `. */
export const openStartOf = (frame: Frame): string => `${frame.tl}${frame.h} `

/** A frame's top border closing: `─┐` after pills, `┐` when the fill runs straight to the corner. */
export const openEndOf = (frame: Frame, hasRight: boolean): string =>
  hasRight ? `${frame.h}${frame.tr}` : frame.tr

/**
 * What a rule row leaves for pills: `columns` less the rule's own chrome and the `titleCells` its
 * title needs at least.
 */
export const ruleRoomFor = (columns: number, titleCells = 0): number =>
  Math.max(0, columns - RULE_CHROME_CELLS - titleCells)

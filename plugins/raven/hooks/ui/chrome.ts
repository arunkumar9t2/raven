/**
 * The cells Raven's chrome takes, in one place: every width calculation that subtracts a border,
 * a gutter or a rule's own glyphs reads them from here rather than carrying a number of its own.
 */

/** What a boxed card's side borders take of its width: `│ ` on the left, ` │` on the right. */
export const BOXED_CELLS = 4

/** What the Doc card's `│ ` left border column takes: the glyph and a space. */
export const BORDER_CELLS = 2

/** Columns the engine keeps at the `AbovePrompt` band's right edge (it draws its own marker there). */
export const BAND_GUTTER = 3

/** The band's room beside its pills: the mark, the summary and the gap, before `chipsLayout` shrinks them. */
export const BAND_LABEL_CELLS = 24

/** The glyphs a card's rules open with, space included: a card's top border and an inner separator. */
export const RULE_START = { open: '╭─ ', branch: '├─ ' } as const

/** A rule's own cells beside its title: the opening glyphs (3), the gap before the fill (1) and one fill cell. */
export const RULE_CHROME_CELLS = 5

/**
 * What a rule row leaves for pills: `columns` less the rule's own chrome and the `titleCells` its
 * title needs at least.
 */
export const ruleRoomFor = (columns: number, titleCells = 0): number =>
  Math.max(0, columns - RULE_CHROME_CELLS - titleCells)

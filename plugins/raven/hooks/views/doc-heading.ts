import { type Chip, chipsFit } from '../ui/chips'
import type { Style } from '../ui/style'
import { TITLE_EDGE_CELLS } from './doc-path'

/** How a section heading draws: its bar, its colour, whether it is dim, and the rule under it. */
export type HeadingLook = {
  /** The group mark drawn before the text (`▌` in `bar`), or null. */
  mark: string | null
  /** Bold accent text (H1 and H2); false is bold in the default colour. */
  accent: boolean
  /** The top section (text above the first heading), which draws no heading text, only its chip. */
  dim: boolean
  /** A dim `─` rule row under the heading (every style except `bar`, H1 and H2 only). */
  rule: boolean
}

/**
 * The heading's look by style and level. H1 and H2 carry the style's group mark and accent text; in
 * a style with no left bar (`none`) or with frames (`sharp`, `rounded`: a doc section cannot be
 * framed, its height is the engine's) they draw a dim rule under the heading instead. H3 and
 * deeper are bold only. Level 0 (text above the first heading) draws no heading at all.
 */
export function headingLookOf(style: Style, level: number): HeadingLook {
  if (level === 0) return { mark: null, accent: false, dim: true, rule: false }
  if (level > 2) return { mark: null, accent: false, dim: false, rule: false }
  return {
    mark: style.group,
    accent: true,
    dim: false,
    rule: style.titleRule || style.frame !== null,
  }
}

/** The cells a heading's mark takes: the glyph and a space, or none. */
export const headingMarkCellsOf = (look: HeadingLook): number => (look.mark === null ? 0 : 2)

/** Cells between a heading's text and its inline chip. */
export const HEADING_GAP = 2

/** The least of a heading's text the chip leaves before it shrinks to its icon. */
export const HEADING_TEXT_MIN = 12

/**
 * `'words'` when the chip fits beside the heading (at least `HEADING_TEXT_MIN` of it, or all of
 * it when shorter) with the gap and the reserved edge cell; else `'icons'`, so a chip shrinks
 * before it is ever cut off.
 */
export function headingChipModeOf(
  columns: number,
  markCells: number,
  headingCells: number,
  chip: Pick<Chip, 'icon' | 'label'>,
): 'words' | 'icons' {
  const text = Math.min(headingCells, HEADING_TEXT_MIN)
  return chipsFit([chip], columns - TITLE_EDGE_CELLS - markCells - text - HEADING_GAP)
}

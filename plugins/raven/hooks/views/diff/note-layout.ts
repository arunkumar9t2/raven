import type { Comment } from '../../review/comments'
import { wrapText } from '../../ui/wrap'

/** A note card's most rows: the first line plus five more. */
export const NOTE_MAX_ROWS = 6

/** The card's left edge: the `┃` bar and the one-cell gap after it. */
const BAR_CELLS = 2
/** The widest an age reads (`99d`) plus the gap before it; `now`/`5m` never exceed it. */
const AGE_CELLS = 4
const GAP = 1
/** A drawn `[ label ]` chip's width. */
const chipWidthOf = (label: string) => label.length + 4

/** The status word a card shows, by its comment's status. */
export const STATUS_WORDS: Record<Comment['status'], string> = {
  pending: 'pending',
  sent: 'sent',
  open: 'open',
  addressed: '✓ addressed',
}

/**
 * The cells row 1's right side reserves: status word, `L<line> ·` and the age (at their widest),
 * the chips (resend when open, then ✕) and the gaps between them. Never less than what draws,
 * so the first text line never meets it and the row never truncates the text.
 */
export function noteRightCellsOf(comment: Comment): number {
  const chips = (comment.status === 'open' ? chipWidthOf('resend') + GAP : 0) + chipWidthOf('✕')
  const line = comment.line ? `L${comment.line.number} · `.length : 0
  return STATUS_WORDS[comment.status].length + GAP + line + AGE_CELLS + GAP + chips + GAP
}

/** The card's text lines at `width` total cells (bar and gap included): row 1 shares its row. */
export function noteLinesOf(comment: Comment, width: number): string[] {
  const textWidth = Math.max(1, width - BAR_CELLS)
  const firstWidth = Math.max(1, textWidth - noteRightCellsOf(comment))
  return wrapText(comment.text, textWidth, NOTE_MAX_ROWS, firstWidth)
}

/** A `┃` per row, one under another: the heavy bar down a multi-row card. */
export const barOf = (rows: number): string =>
  Array.from({ length: Math.max(1, rows) }, () => '┃').join('\n')

/** The compose box's rows: an Input and the hint row, plus a line picker above on a hunk. */
export const composeRowsOf = (hasPicker: boolean): number => (hasPicker ? 3 : 2)

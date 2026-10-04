import type { Comment } from '../../review/comments'
import { CARD_BAR_CELLS } from '../../ui/card'
import { type Chip, chipsWidthOf } from '../../ui/chips'
import { wrapText } from '../../ui/wrap'
import { dropKeyOf, resendKeyOf } from './anchor'

/** A note card's most rows: the first line plus five more. */
export const NOTE_MAX_ROWS = 6

/** The widest an age reads (`99d`); `now`/`5m` never exceed it. */
const AGE_CELLS = 4
const GAP = 1
/** Row 1 shares its text room with the right side; under this many cells it gives the text up. */
const MIN_FIRST_WIDTH = 8

/** The status word a card shows, by its comment's status. */
export const STATUS_WORDS: Record<Comment['status'], string> = {
  pending: 'pending',
  sent: 'sent',
  open: 'open',
  addressed: '✓ addressed',
}

/**
 * A note's chips — `resend` when open, then `✕` — the one list the card draws and the reserved
 * width counts. The handlers default to nothing for the width math.
 */
export function noteChipsOf(
  comment: Comment,
  onRemove: (id: string) => void = () => {},
  onResend: () => void = () => {},
): Chip[] {
  const chips: Chip[] = []
  if (comment.status === 'open') {
    chips.push({
      key: resendKeyOf(comment.id),
      icon: '',
      label: 'resend',
      onPress: onResend,
    })
  }
  chips.push({
    key: dropKeyOf(comment.id),
    icon: '✕',
    label: '',
    onPress: () => onRemove(comment.id),
  })
  return chips
}

/**
 * The cells row 1's right side reserves: status word, `L<line> ·` and the age (at their widest),
 * the chips and the gaps between them. Never less than what draws, so the first text line never
 * meets it and the row never truncates the text.
 */
function noteRightCellsOf(comment: Comment): number {
  const line = comment.line ? `L${comment.line.number} · `.length : 0
  const chips = chipsWidthOf(noteChipsOf(comment))
  return STATUS_WORDS[comment.status].length + GAP + line + AGE_CELLS + GAP + chips + GAP
}

/** The card's text lines at `width` total cells (bar and gap included): row 1 shares its row. */
export function noteLinesOf(comment: Comment, width: number): string[] {
  const textWidth = Math.max(1, width - CARD_BAR_CELLS)
  const firstWidth = textWidth - noteRightCellsOf(comment)
  // Too little room beside the status, meta and chips: row 1 carries only those, text from row 2.
  if (firstWidth < MIN_FIRST_WIDTH) {
    return ['', ...wrapText(comment.text, textWidth, NOTE_MAX_ROWS - 1)]
  }
  return wrapText(comment.text, textWidth, NOTE_MAX_ROWS, firstWidth)
}

/**
 * The compose box's rows: the Input — which draws at most two rows, longer text scrolling inside
 * them (measured live) — the hint row, and a line picker above on a hunk. A short comment leaves
 * one spare tinted row.
 */
export const composeRowsOf = (hasPicker: boolean): number => (hasPicker ? 4 : 3)

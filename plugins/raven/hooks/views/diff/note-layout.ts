import type { Comment } from '../../review/comments'
import type { Chip } from '../../ui/chips'
import { BOXED_CELLS } from '../../ui/chrome'
import { wrapText } from '../../ui/wrap'
import { dropKeyOf, resendKeyOf } from './anchor'

/** A note card's most text lines; the card is these plus its top and bottom border. */
export const NOTE_MAX_LINES = 6
/** The rows of a card with `lines` text lines: the text between a top and a bottom border. */
export const noteRowsOf = (lines: number): number => lines + 2

/** The status word a card shows, by its comment's status. */
export const STATUS_WORDS: Record<Comment['status'], string> = {
  pending: 'pending',
  sent: 'sent',
  open: 'open',
  addressed: '✓ addressed',
}

/**
 * A note's chips (`resend` when open, then `✕`), the one list the card draws and the reserved
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
 * The card's text lines at `width` total cells (side borders included): the status, age and pills
 * live on the top border, so every line is body text, wrapped to the room between the borders.
 */
export function noteLinesOf(comment: Comment, width: number): string[] {
  return wrapText(comment.text, Math.max(1, width - BOXED_CELLS), NOTE_MAX_LINES)
}

/**
 * The compose box's interior rows: the Input (which draws at most two rows, longer text scrolling
 * inside them, measured live), the hint row, and a line picker above on a hunk. A short comment
 * leaves one spare tinted row.
 */
export const composeInnerRowsOf = (hasPicker: boolean): number => (hasPicker ? 4 : 3)

/** The compose box's rows: the interior between a top and a bottom border. */
export const composeRowsOf = (hasPicker: boolean): number => composeInnerRowsOf(hasPicker) + 2

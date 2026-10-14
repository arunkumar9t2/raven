import type { Comment } from '../../review/comments'
import type { Chip } from '../../ui/chips'
import { BOXED_CELLS, NOTE_CELLS } from '../../ui/chrome'
import { wrapText } from '../../ui/wrap'
import { dropKeyOf, resendKeyOf } from './anchor'

/** A note's most text lines. */
export const NOTE_MAX_LINES = 6
/** The rows of a note with `lines` text lines: a header row (status, line, age, chips), then the text. */
export const noteRowsOf = (lines: number): number => lines + 1

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
 * The note's text lines at `width` total cells (the `┃ ` bar included): the status, age and pills
 * live on the header row, so every line is body text, wrapped to the room beside the bar.
 */
export function noteLinesOf(comment: Comment, width: number): string[] {
  return wrapText(comment.text, Math.max(1, width - NOTE_CELLS), NOTE_MAX_LINES)
}

/** The line picker's cells when it shares the Input's row (its label is cut to fit). */
export const COMPOSE_PICKER_CELLS = 24
/** The least cells the Input gets beside its neighbours before they wrap to rows of their own. */
export const COMPOSE_INPUT_CELLS = 32
/** The ` ✕ cancel ` pill. */
export const COMPOSE_ACTION_CELLS = 10
const COMPOSE_GAP = 1

export type ComposeLayout = {
  /** The line picker sits on its own row above the Input (a hunk anchor, pane too narrow for one row). */
  pickerRow: boolean
  /** The cancel pill sits on its own row under the Input. */
  actionsRow: boolean
  /** The interior rows: the Input's one row plus each wrapped row. */
  inner: number
}

/**
 * How the compose box lays out its interior at `innerWidth` cells (the box less its frame):
 * picker, Input and cancel on one row when they fit; else the picker on its own row above, and the
 * cancel pill on its own row below when even Input and cancel do not fit side by side.
 */
export function composeLayoutOf(hasPicker: boolean, innerWidth: number): ComposeLayout {
  const picker = hasPicker ? COMPOSE_PICKER_CELLS + COMPOSE_GAP : 0
  const beside = COMPOSE_INPUT_CELLS + COMPOSE_GAP + COMPOSE_ACTION_CELLS
  if (picker + beside <= innerWidth) return { pickerRow: false, actionsRow: false, inner: 1 }
  const actionsRow = beside > innerWidth
  return {
    pickerRow: hasPicker,
    actionsRow,
    inner: 1 + (hasPicker ? 1 : 0) + (actionsRow ? 1 : 0),
  }
}

/** The compose box's rows at `contentWidth`: the interior between a top and a bottom border. */
export const composeRowsOf = (hasPicker: boolean, contentWidth: number): number =>
  composeLayoutOf(hasPicker, Math.max(1, contentWidth - BOXED_CELLS)).inner + 2

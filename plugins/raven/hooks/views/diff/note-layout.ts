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
/** The Input's own `⏎ add` label and the gap before it, drawn inside the Input's width. */
export const COMPOSE_SUBMIT_CELLS = 8
const COMPOSE_GAP = 1

export type ComposeLayout = {
  /** The line picker sits on its own row above the Input (a hunk anchor, pane too narrow for one row). */
  pickerRow: boolean
  /** The cancel pill sits on its own row under the Input. */
  actionsRow: boolean
  /** The interior rows: the Input's rows plus each wrapped row. */
  inner: number
}

/**
 * How the compose box lays out its interior at `innerWidth` cells (the box less its frame):
 * picker, Input and cancel on one row when they fit; else the picker on its own row above, and the
 * cancel pill on its own row below when even Input and cancel do not fit side by side.
 */
export function composeLayoutOf(
  hasPicker: boolean,
  innerWidth: number,
  inputRows: 1 | 2 = 1,
): ComposeLayout {
  const picker = hasPicker ? COMPOSE_PICKER_CELLS + COMPOSE_GAP : 0
  const beside = COMPOSE_INPUT_CELLS + COMPOSE_GAP + COMPOSE_ACTION_CELLS
  if (picker + beside <= innerWidth)
    return { pickerRow: false, actionsRow: false, inner: inputRows }
  const actionsRow = beside > innerWidth
  return {
    pickerRow: hasPicker,
    actionsRow,
    inner: inputRows + (hasPicker ? 1 : 0) + (actionsRow ? 1 : 0),
  }
}

/**
 * Whether the Input needs a second row for `chars` typed characters: its width is the interior
 * less whatever shares its row (an inline picker, an inline cancel) and its own submit label. The
 * Input draws at most two rows, scrolling inside them beyond that.
 */
export function composeInputRowsOf(chars: number, hasPicker: boolean, innerWidth: number): 1 | 2 {
  const layout = composeLayoutOf(hasPicker, innerWidth)
  const beside =
    (hasPicker && !layout.pickerRow ? COMPOSE_PICKER_CELLS + COMPOSE_GAP : 0) +
    (layout.actionsRow ? 0 : COMPOSE_ACTION_CELLS + COMPOSE_GAP)
  const inputCells = Math.max(1, innerWidth - beside - COMPOSE_SUBMIT_CELLS)
  return chars >= inputCells ? 2 : 1
}

/** The compose box's rows at `contentWidth`: the interior between a top and a bottom border. */
export const composeRowsOf = (
  hasPicker: boolean,
  contentWidth: number,
  inputRows: 1 | 2 = 1,
): number =>
  composeLayoutOf(hasPicker, Math.max(1, contentWidth - BOXED_CELLS), inputRows).inner + 2

import type { Comment } from '../../review/comments'
import type { Chip } from '../../ui/chips'
import { BOXED_CELLS, NOTE_CELLS } from '../../ui/chrome'
import { cutTailToCells, widthOf, wrapText } from '../../ui/wrap'
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
/** The most rows the wrapped preview under the Input draws. */
export const COMPOSE_PREVIEW_MAX_LINES = 6
/** The columns a preview row is indented. */
export const COMPOSE_PREVIEW_INDENT = 2
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

/** The compose interior's cells in a box `columns` wide (the frame less). */
export const composeInnerWidthOf = (columns: number): number => Math.max(1, columns - BOXED_CELLS)

/**
 * The cells the compose Input shows its text in: the interior less an inline picker, an inline
 * cancel pill and the Input's own submit label.
 */
function composeInputCellsOf(hasPicker: boolean, innerWidth: number): number {
  const layout = composeLayoutOf(hasPicker, innerWidth)
  const beside =
    (hasPicker && !layout.pickerRow ? COMPOSE_PICKER_CELLS + COMPOSE_GAP : 0) +
    (layout.actionsRow ? 0 : COMPOSE_ACTION_CELLS + COMPOSE_GAP)
  return Math.max(1, innerWidth - beside - COMPOSE_SUBMIT_CELLS)
}

let memo: { key: string; lines: readonly string[] } | null = null

/**
 * The wrapped preview under the compose Input: the whole typed `text` once it no longer fits the
 * Input's visible cells, else none. Lines wrap to the interior less the indent, at most
 * `COMPOSE_PREVIEW_MAX_LINES`; past that the last lines show (the end is where the person types)
 * with the first led by `…` and its start dropped to fit, so its end meets the next row intact.
 * The last result is kept, so repeated calls in one render wrap once.
 */
export function composePreviewLinesOf(
  text: string,
  hasPicker: boolean,
  innerWidth: number,
): readonly string[] {
  if (widthOf(text) < composeInputCellsOf(hasPicker, innerWidth)) return []
  const key = `${hasPicker ? 1 : 0}:${innerWidth}:${text}`
  if (memo?.key === key) return memo.lines

  const width = Math.max(1, innerWidth - COMPOSE_PREVIEW_INDENT)
  const all = wrapText(text, width, Number.MAX_SAFE_INTEGER)
  let lines: readonly string[] = all
  if (all.length > COMPOSE_PREVIEW_MAX_LINES) {
    const shown = all.slice(-COMPOSE_PREVIEW_MAX_LINES)
    shown[0] = `…${cutTailToCells(shown[0] as string, width - 1)}`
    lines = shown
  }
  memo = { key, lines }
  return lines
}

/** How many preview rows `text` draws; cheap while it still fits the Input (no wrapping). */
export function composePreviewCountOf(
  text: string,
  hasPicker: boolean,
  innerWidth: number,
): number {
  if (widthOf(text) < composeInputCellsOf(hasPicker, innerWidth)) return 0
  return composePreviewLinesOf(text, hasPicker, innerWidth).length
}

/**
 * The compose box's rows at `contentWidth`: the interior between a top and a bottom border, plus
 * `previewRows` (the length of the block's `preview`).
 */
export function composeRowsOf(hasPicker: boolean, contentWidth: number, previewRows = 0): number {
  return composeLayoutOf(hasPicker, composeInnerWidthOf(contentWidth)).inner + previewRows + 2
}

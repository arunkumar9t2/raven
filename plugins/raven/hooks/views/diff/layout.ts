import { bodyLinesOf, type Hunk, hunkFrom, hunkLinesOf, parseHeader } from '../../git/hunks'
import type { CommentStatus } from '../../review/comments'
import type { SplitHunk } from './split'
import type { WholeSide } from './whole-file'

/** A body block: a payload of known height, or a hunk whose body lines are its rows. */
export type Block<T = unknown> =
  | {
      kind: 'fixed'
      key: string
      rows: number
      item: T
      /** Placed whole even when it straddles the window's top (an Input must stay mounted). */
      pinned?: boolean
      /** True on a file card's title block: `viewOf` pins it to the body's top while the card scrolls. */
      title?: boolean
      /** The file whose card this block belongs to; absent on the rows between cards and on the trailing groups. */
      card?: string
      /** True on the trailing "Not in this diff" group's blocks: routed by this flag, never by key. */
      orphan?: boolean
    }
  | {
      kind: 'hunk'
      key: string
      hunk: Hunk
      /** Set when the block's last line carries a note: that note's status colours its rail cell. */
      mark?: CommentStatus
      /**
       * Set on a wholly added (`new`) or deleted (`old`) file's hunk blocks: drawn as numbered
       * source (`wholeSourceOf`) rather than a diff, with the rail in the file's status colour.
       * Never split side by side: one column would be blank.
       */
      whole?: WholeSide
      /** Present when the hunk draws side by side: its rows are these, not the body lines. Never on a `whole` block. */
      split?: SplitHunk
      /** The file whose card this block belongs to. */
      card?: string
      /** See the fixed variant: set on the trailing orphans group's blocks. */
      orphan?: boolean
    }

/** A fixed block: one with a declared row count. */
export type FixedBlock<T = unknown> = Extract<Block<T>, { kind: 'fixed' }>

/** A block placed in the window: rows [from, to) of it are visible. */
export type Placed<T = unknown> = { block: Block<T>; from: number; to: number }

/** The rows a block takes: a fixed block its declared rows, a hunk its split rows or body line count. */
export function rowsOf(block: Block): number {
  if (block.kind === 'fixed') return block.rows
  return block.split ? block.split.rows.length : bodyLinesOf(block.hunk).length
}

/** The rows all the blocks take together. */
export function contentRowsOf(blocks: readonly Block[]): number {
  return blocks.reduce((sum, block) => sum + rowsOf(block), 0)
}

/**
 * The blocks visible in rows [top, top + rows). A fixed block is placed whole when its first row
 * is visible (the pane clips any overhang); a hunk is placed with the exact visible line range.
 * A pinned block straddling `top` is drawn whole, so the blocks after it lose as many rows at the
 * bottom as it draws above `top`: the window never draws more than `rows` rows.
 */
export function windowOf<T>(
  blocks: readonly Block<T>[],
  top: number,
  rows: number,
  mountTop: number = top,
): Placed<T>[] {
  let bottom = top + rows
  const placed: Placed<T>[] = []
  let offset = 0

  for (const block of blocks) {
    const blockRows = rowsOf(block)
    const start = offset
    const end = start + blockRows
    offset = end

    // A pinned block stays mounted while any of its rows is at or below `mountTop` (the row the
    // pinned title overlays, when one is shown); others only while a row is in the window.
    if (end <= (block.kind === 'fixed' && block.pinned ? mountTop : top) || start >= bottom)
      continue

    if (block.kind === 'fixed') {
      // A card straddling the top stays placed with its top rows clipped; a pinned block whole.
      const from = block.pinned ? 0 : Math.max(0, top - start)
      placed.push({ block, from, to: blockRows })
      // A pinned block drawn whole from above the window pushes what follows down by the rows
      // that would have been clipped, so the window gives them up at its bottom.
      if (block.pinned && start < top) bottom -= top - start
    } else {
      const from = Math.max(0, top - start)
      const to = Math.min(blockRows, bottom - start)
      if (from < to) placed.push({ block, from, to })
    }
  }

  return placed
}

/**
 * The title block to pin at the body's top for a window starting at row `top`: the title of the
 * card that holds row `top`, when that title starts above it. Null when `top` is 0, on a title's
 * first row, on a row between cards, or past the last card (the blocks there carry no `card`).
 */
export function pinnedTitleOf<T>(blocks: readonly Block<T>[], top: number): FixedBlock<T> | null {
  if (top <= 0) return null
  let offset = 0
  let title: FixedBlock<T> | null = null
  let titleStart = -1
  for (const block of blocks) {
    const start = offset
    offset += rowsOf(block)
    if (block.kind === 'fixed' && block.title && block.card !== undefined) {
      title = block
      titleStart = start
    }
    if (top < offset) {
      if (block.card === undefined || title === null || title.card !== block.card) return null
      return titleStart < top ? title : null
    }
  }
  return null
}

/**
 * The window the body draws: the pinned title (if any) in the first row and the blocks from
 * `top + 1` for `rows - 1` rows beneath it, else `windowOf(blocks, top, rows)`. The pin overlays
 * the row at `top`, so the stream's final row is still reachable at the maximum scroll without
 * `clampTop` knowing about the pin. Fewer than two rows never pin.
 */
export function viewOf<T>(
  blocks: readonly Block<T>[],
  top: number,
  rows: number,
): { pinned: FixedBlock<T> | null; placed: Placed<T>[] } {
  const pinned = rows >= 2 ? pinnedTitleOf(blocks, top) : null
  if (pinned === null) return { pinned: null, placed: windowOf(blocks, top, rows) }
  return { pinned, placed: windowOf(blocks, top + 1, rows - 1, top) }
}

/**
 * Lines [from, to) of a hunk's body as a hunk of their own, its header renumbered so the gutters
 * still show the true old/new line numbers (count ' ' and '-' lines for old, ' ' and '+' for new;
 * '\ No newline' lines count for neither).
 */
export function sliceHunk(hunk: Hunk, from: number, to: number): Hunk {
  const slice = bodyLinesOf(hunk).slice(from, to)

  const parsed = parseHeader(hunk.header)
  if (!parsed) return hunkFrom(hunk.header, slice)

  const lines = hunkLinesOf(hunk)
  const inSlice = lines.filter(line => line.index >= from && line.index < to)
  // The slice starts at the first diff line at or after `from`; with none left, past the last.
  const first = lines.find(line => line.index >= from)
  const oldStart = first?.oldLine ?? parsed.oldStart + lines.filter(l => l.kind !== 'add').length
  const newStart = first?.newLine ?? parsed.newStart + lines.filter(l => l.kind !== 'del').length
  const oldCount = inSlice.filter(line => line.kind !== 'add').length
  const newCount = inSlice.filter(line => line.kind !== 'del').length

  return hunkFrom(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${parsed.suffix}`, slice)
}

/** Whether the view at `top` draws the stream's last row. */
function showsEnd<T>(blocks: readonly Block<T>[], top: number, rows: number): boolean {
  const last = blocks[blocks.length - 1]
  if (!last) return true
  return viewOf(blocks, top, rows).placed.some(p => p.block === last && p.to === rowsOf(last))
}

/**
 * The largest `top` that can be scrolled to. Normally `contentRows - rows`. A pinned block (the
 * compose box) straddling that top is drawn whole and takes its above-window rows out of the
 * window's bottom, so the stream's last rows would never be drawn while it stays mounted; the max
 * then moves down to the first `top` whose view shows the last row (the box's own end at the
 * latest, where it unmounts).
 */
export function maxTopOf<T>(blocks: readonly Block<T>[], rows: number): number {
  const content = contentRowsOf(blocks)
  const base = Math.max(0, content - rows)
  if (showsEnd(blocks, base, rows)) return base
  for (let top = base + 1; top < content; top++) {
    if (showsEnd(blocks, top, rows)) return top
  }
  return base
}

/**
 * Keeps `top` within [0, max(0, contentRows - rows)]; with `blocks`, within `maxTopOf` instead, so
 * a pinned compose box cannot hide the stream's tail.
 */
export function clampTop(
  top: number,
  contentRows: number,
  rows: number,
  blocks?: readonly Block[],
): number {
  const max = blocks ? maxTopOf(blocks, rows) : Math.max(0, contentRows - rows)
  return Math.max(0, Math.min(top, max))
}

/** The row of the block with `key`, for jumping to a file or comment; null when absent. */
export function rowOfKey(blocks: readonly Block[], key: string): number | null {
  let offset = 0
  for (const block of blocks) {
    if (block.key === key) return offset
    offset += rowsOf(block)
  }
  return null
}

/**
 * The file index reached moving `by` steps (1 next, -1 previous) from `index`, clamped to
 * `[0, count)`; `-1` (nothing selected) steps from just before the front.
 */
export function stepFileIndexOf(count: number, index: number, by: number): number {
  if (count === 0) return -1
  return Math.max(0, Math.min(count - 1, index + by))
}

/** A fixed list's window: the items shown, and how many trail past the shown window. */
export type ListWindow = { start: number; end: number; more: number }

/**
 * A window of at most `max` rows over a list of `count` items: every item when they fit; else
 * `max - 1` items centered on `selectedIndex` (clamped to the list) plus a trailing "more" count.
 */
export function fileWindowOf(count: number, selectedIndex: number, max: number): ListWindow {
  if (count <= max) return { start: 0, end: count, more: 0 }
  const visible = Math.max(1, max - 1)
  const index = Math.max(0, selectedIndex)
  const start = Math.max(0, Math.min(count - visible, index - Math.floor(visible / 2)))
  const end = start + visible
  return { start, end, more: count - end }
}

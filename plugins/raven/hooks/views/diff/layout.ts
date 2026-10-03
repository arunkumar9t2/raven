import { bodyLinesOf, type Hunk, hunkFrom, hunkLinesOf, parseHeader } from '../../git/hunks'
import type { CommentStatus } from '../../review/comments'

/** A body block: a payload of known height, or a hunk whose body lines are its rows. */
export type Block<T = unknown> =
  | {
      kind: 'fixed'
      key: string
      rows: number
      item: T
      /** Placed whole even when it straddles the window's top (an Input must stay mounted). */
      pinned?: boolean
    }
  | {
      kind: 'hunk'
      key: string
      hunk: Hunk
      /** Set when the block's last line carries a note: that note's status colours its rail cell. */
      mark?: CommentStatus
    }

/** A block placed in the window: rows [from, to) of it are visible. */
export type Placed<T = unknown> = { block: Block<T>; from: number; to: number }

/** The rows a block takes: a fixed block its declared rows, a hunk its body line count. */
export function rowsOf(block: Block): number {
  return block.kind === 'fixed' ? block.rows : bodyLinesOf(block.hunk).length
}

/** The rows all the blocks take together. */
export function contentRowsOf(blocks: readonly Block[]): number {
  return blocks.reduce((sum, block) => sum + rowsOf(block), 0)
}

/**
 * The blocks visible in rows [top, top + rows). A fixed block is placed whole when its first row
 * is visible (the pane clips any overhang); a hunk is placed with the exact visible line range.
 */
export function windowOf<T>(blocks: readonly Block<T>[], top: number, rows: number): Placed<T>[] {
  const bottom = top + rows
  const placed: Placed<T>[] = []
  let offset = 0

  for (const block of blocks) {
    const blockRows = rowsOf(block)
    const start = offset
    const end = start + blockRows
    offset = end

    if (end <= top || start >= bottom) continue

    if (block.kind === 'fixed') {
      // A card straddling the top stays placed with its top rows clipped; a pinned block whole.
      const from = block.pinned ? 0 : Math.max(0, top - start)
      placed.push({ block, from, to: blockRows })
    } else {
      const from = Math.max(0, top - start)
      const to = Math.min(blockRows, bottom - start)
      if (from < to) placed.push({ block, from, to })
    }
  }

  return placed
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

/** Keeps `top` within [0, max(0, contentRows - rows)]. */
export function clampTop(top: number, contentRows: number, rows: number): number {
  const max = Math.max(0, contentRows - rows)
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

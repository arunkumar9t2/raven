import { bodyLinesOf, type Hunk, hunkFrom, parseHeader } from '../../git/hunks'
import type { CommentStatus } from '../../review/comments'

/** A body block: a payload of known height, or a hunk whose body lines are its rows. */
export type Block<T = unknown> =
  | { kind: 'fixed'; key: string; rows: number; item: T }
  | {
      kind: 'hunk'
      key: string
      hunk: Hunk
      /** The body lines [from, to) this block shows, when a hunk is split around inline notes. */
      range?: { from: number; to: number }
      /** Set when the block's last line carries a note: that note's status colours its rail cell. */
      mark?: CommentStatus
    }

/** A block placed in the window: rows [from, to) of it are visible. */
export type Placed<T = unknown> = { block: Block<T>; from: number; to: number }

/** The rows a block takes: a fixed block its declared rows, a hunk its body line count. */
export function rowsOf(block: Block): number {
  if (block.kind === 'fixed') return block.rows
  return block.range ? block.range.to - block.range.from : bodyLinesOf(block.hunk).length
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
      if (start >= top) placed.push({ block, from: 0, to: blockRows })
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
  const lines = bodyLinesOf(hunk)
  const slice = lines.slice(from, to)

  const parsed = parseHeader(hunk.header)
  if (!parsed) return hunkFrom(hunk.header, slice)

  const { oldStart, newStart, suffix } = parsed

  const isOld = (line: string) => line.startsWith(' ') || line.startsWith('-')
  const isNew = (line: string) => line.startsWith(' ') || line.startsWith('+')

  const before = lines.slice(0, from)

  const oldStartOut = oldStart + before.filter(isOld).length
  const newStartOut = newStart + before.filter(isNew).length
  const oldCountOut = slice.filter(isOld).length
  const newCountOut = slice.filter(isNew).length

  const header = `@@ -${oldStartOut},${oldCountOut} +${newStartOut},${newCountOut} @@${suffix}`

  return hunkFrom(header, slice)
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

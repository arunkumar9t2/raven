import type { Hunk } from '../../git/hunks'

/** A body block: an element of known height, or a hunk whose body lines are its rows. */
export type Block =
  | { kind: 'fixed'; key: string; rows: number }
  | { kind: 'hunk'; key: string; hunk: Hunk }

/** A block placed in the window: rows [from, to) of it are visible. */
export type Placed = { block: Block; from: number; to: number }

const HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

// hunk.text is the header line plus '\n'-joined body lines, trailing '\n'; the header itself
// isn't a row, so drop the first line and the empty tail left by the trailing '\n'.
function bodyLinesOf(hunk: Hunk): string[] {
  const lines = hunk.text.split('\n')
  lines.pop()
  lines.shift()
  return lines
}

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
export function windowOf(blocks: readonly Block[], top: number, rows: number): Placed[] {
  const bottom = top + rows
  const placed: Placed[] = []
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

  const match = HEADER_RE.exec(hunk.header)
  if (!match) return { header: hunk.header, text: `${[hunk.header, ...slice].join('\n')}\n` }

  const oldStart = Number(match[1])
  const newStart = Number(match[3])
  const suffix = match[5] ?? ''

  const isOld = (line: string) => line.startsWith(' ') || line.startsWith('-')
  const isNew = (line: string) => line.startsWith(' ') || line.startsWith('+')

  const before = lines.slice(0, from)

  const oldStartOut = oldStart + before.filter(isOld).length
  const newStartOut = newStart + before.filter(isNew).length
  const oldCountOut = slice.filter(isOld).length
  const newCountOut = slice.filter(isNew).length

  const header = `@@ -${oldStartOut},${oldCountOut} +${newStartOut},${newCountOut} @@${suffix}`

  return { header, text: `${[header, ...slice].join('\n')}\n` }
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

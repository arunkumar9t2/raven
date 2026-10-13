import { ELEMENT_TEXT_LIMIT } from '../../core/view'
import type { ChangeStatus } from '../../git/changes'
import { bodyLinesOf, type Hunk, lineKindOf, parseHeader } from '../../git/hunks'

/** Which side of a wholly added (`new`) or deleted (`old`) file's hunk carries the file's lines. */
export type WholeSide = 'new' | 'old'

/** The side a file's hunks are wholly on, from its status; undefined for an ordinary diff. */
export const wholeSideOf = (status: ChangeStatus): WholeSide | undefined => {
  if (status === 'untracked' || status === 'added') return 'new'
  if (status === 'deleted') return 'old'
  return undefined
}

/** The title tag of a wholly new or deleted file. */
export const fileTagOf = (status: ChangeStatus): string | null => {
  const side = wholeSideOf(status)
  if (side === 'new') return 'new file'
  return side === 'old' ? 'deleted' : null
}

export type WholeSource = {
  /** The lines with their `+`/`-` stripped, joined by `\n`; '' when only the marker is in view. */
  source: string
  /** The number of source lines. */
  count: number
  /** The 1-based number of the first source line (the new side for `new`, the old side for `old`). */
  startLine: number
  /** The trailing `\ No newline at end of file` marker lines, drawn dim under the source. */
  tail: string[]
}

/**
 * A (sliced) hunk of a wholly added or deleted file as source text: every line must be of
 * `side`'s kind (`+` for new, `-` for old) and any `\ No newline` marker must come last, else
 * `null` (the caller then draws the diff). `startLine` is the slice header's own start, which
 * `sliceHunk` renumbers, so a segment cut mid-file or split by a note still numbers correctly.
 */
export function wholeSourceOf(hunk: Hunk, side: WholeSide): WholeSource | null {
  const parsed = parseHeader(hunk.header)
  if (!parsed) return null
  const wanted = side === 'new' ? 'add' : 'del'
  const lines: string[] = []
  const tail: string[] = []
  for (const text of bodyLinesOf(hunk)) {
    if (text.startsWith('\\')) {
      tail.push(text)
      continue
    }
    if (tail.length > 0) return null
    if (lineKindOf(text) !== wanted) return null
    lines.push(text.slice(1))
  }
  if (lines.length === 0 && tail.length === 0) return null
  return {
    source: lines.join('\n'),
    count: lines.length,
    startLine: side === 'new' ? parsed.newStart : parsed.oldStart,
    tail,
  }
}

/**
 * `whole` cut into pieces of at most `max` characters (the engine's `Code` cap) at line
 * boundaries, each numbered on from the one before; the marker tail rides on the last piece. A
 * view that already fits is one piece, returned as is. A single line over the cap is cut hard.
 */
export function wholePiecesOf(whole: WholeSource, max = ELEMENT_TEXT_LIMIT): WholeSource[] {
  if (whole.source.length <= max) return [whole]
  const pieces: WholeSource[] = []
  let current: string[] = []
  let size = 0
  let start = whole.startLine
  const flush = () => {
    if (current.length === 0) return
    pieces.push({ source: current.join('\n'), count: current.length, startLine: start, tail: [] })
    start += current.length
    current = []
    size = 0
  }
  for (const line of whole.source.split('\n')) {
    const text = line.length > max ? line.slice(0, max) : line
    if (size + text.length + (current.length > 0 ? 1 : 0) > max) flush()
    size += text.length + (current.length > 0 ? 1 : 0)
    current.push(text)
  }
  flush()
  const last = pieces[pieces.length - 1]
  if (last) last.tail = whole.tail
  return pieces
}

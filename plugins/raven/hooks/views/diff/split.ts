import { bodyLinesOf, type Hunk, lineKindOf, parseHeader } from '../../git/hunks'
import type { CommentLine } from '../../review/comments'

/** One side of a split row: the line number on that side, its text without the diff prefix, and its mark. */
export type SideLine = { n: number; text: string; mark: ' ' | '+' | '-' }

/**
 * One terminal row of a side-by-side hunk. A context row has both sides; a change row pairs a
 * removed line (left) with an added line (right), the shorter side of a run padded with `null`.
 */
export type SplitRow = { left: SideLine | null; right: SideLine | null; kind: 'context' | 'change' }

/** A hunk's side-by-side rows, and the width in digits of its line-number gutter. */
export type SplitHunk = { rows: readonly SplitRow[]; gutter: number }

/**
 * Cuts a hunk body (its lines joined with '\n', header excluded) into side-by-side rows. A change
 * run (consecutive removed and added lines, in any order) pairs its removed lines with its added
 * lines by position, the shorter side padded with `null` after the pairs; a context line is one
 * row on both sides. A `\ No newline at end of file` marker and a blank line are not rows: they
 * belong to the line above and advance neither counter, as in `hunkLinesOf`.
 */
export function splitRowsOf(hunkBody: string, oldStart: number, newStart: number): SplitRow[] {
  const rows: SplitRow[] = []
  let oldN = oldStart
  let newN = newStart
  let removed: SideLine[] = []
  let added: SideLine[] = []

  const flush = () => {
    const count = Math.max(removed.length, added.length)
    for (let i = 0; i < count; i++) {
      rows.push({ kind: 'change', left: removed[i] ?? null, right: added[i] ?? null })
    }
    removed = []
    added = []
  }

  for (const line of hunkBody.split('\n')) {
    const kind = lineKindOf(line)
    if (kind === null) continue
    const text = line.slice(1)
    if (kind === 'del') {
      removed.push({ n: oldN, text, mark: '-' })
      oldN += 1
    } else if (kind === 'add') {
      added.push({ n: newN, text, mark: '+' })
      newN += 1
    } else {
      flush()
      rows.push({
        kind: 'context',
        left: { n: oldN, text, mark: ' ' },
        right: { n: newN, text, mark: ' ' },
      })
      oldN += 1
      newN += 1
    }
  }
  flush()
  return rows
}

const rowsCache = new WeakMap<Hunk, readonly SplitRow[]>()

/** A hunk's split rows, numbered from its header (1 and 1 for a malformed one), memoized per hunk. */
export function splitRowsOfHunk(hunk: Hunk): readonly SplitRow[] {
  const cached = rowsCache.get(hunk)
  if (cached) return cached
  const parsed = parseHeader(hunk.header)
  const rows = splitRowsOf(
    bodyLinesOf(hunk).join('\n'),
    parsed?.oldStart ?? 1,
    parsed?.newStart ?? 1,
  )
  rowsCache.set(hunk, rows)
  return rows
}

/** The digits of the highest line number either side of `hunk` reaches; 1 for a malformed header. */
export function gutterWidthOf(hunk: Hunk): number {
  const parsed = parseHeader(hunk.header)
  if (!parsed) return 1
  const last = Math.max(parsed.oldStart + parsed.oldCount, parsed.newStart + parsed.newCount) - 1
  return String(Math.max(1, last)).length
}

/** `hunk` as side-by-side rows; `gutter` is passed when a slice must keep its whole hunk's width. */
export const splitHunkOf = (hunk: Hunk, gutter: number = gutterWidthOf(hunk)): SplitHunk => ({
  rows: splitRowsOfHunk(hunk),
  gutter,
})

/**
 * The exclusive end, in body rows, of the run body row `at` belongs to: for a removed or added
 * line the end of its change run, for a context line the line itself; a `\ No newline` marker
 * after either stays with the line above it. A note on a changed line draws under this row.
 */
export function runEndOf(body: readonly string[], at: number): number {
  const kind = lineKindOf(body[at] ?? '')
  let to = at + 1
  if (kind === 'add' || kind === 'del') {
    while (to < body.length) {
      const next = body[to] ?? ''
      const nextKind = lineKindOf(next)
      if (nextKind === 'add' || nextKind === 'del' || next.startsWith('\\')) to += 1
      else break
    }
  } else {
    while (body[to]?.startsWith('\\')) to += 1
  }
  return to
}

/** The lines a note may be put on: both sides in unified, the new side only in split. */
export const pickableLinesOf = (lines: readonly CommentLine[], isSplit: boolean): CommentLine[] =>
  isSplit ? lines.filter(line => line.side === 'new') : [...lines]

import { ELEMENT_TEXT_LIMIT } from '../core/view'
export type Hunk = { header: string; text: string }

const HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/

/** A hunk header's four numbers and trailing suffix ('@@ …' section text); null if malformed. */
export function parseHeader(header: string): {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  suffix: string
} | null {
  const match = HEADER_RE.exec(header)
  if (!match) return null
  return {
    oldStart: Number(match[1]),
    oldCount: match[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match[3]),
    newCount: match[4] === undefined ? 1 : Number(match[4]),
    suffix: match[5] ?? '',
  }
}

/** A hunk body line's kind; null for '' and the '\ No newline at end of file' marker. */
export function lineKindOf(line: string): 'add' | 'del' | 'context' | null {
  if (line === '' || line.startsWith('\\')) return null
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'context'
}

const bodyLinesCache = new WeakMap<Hunk, readonly string[]>()

/** A hunk's body lines (header dropped, trailing '\n''s empty tail dropped), memoized per hunk. */
export function bodyLinesOf(hunk: Hunk): readonly string[] {
  const cached = bodyLinesCache.get(hunk)
  if (cached) return cached
  const lines = hunk.text.split('\n')
  lines.pop()
  lines.shift()
  bodyLinesCache.set(hunk, lines)
  return lines
}

/** One diff line of a hunk body: its row, kind, and its numbers on each side (the cursor, for the side it is not on). */
export type HunkLine = {
  index: number
  kind: 'add' | 'del' | 'context'
  oldLine: number
  newLine: number
}

/**
 * Walks a hunk's body once, yielding every diff line (not the `\ No newline` marker, which advances
 * neither counter) with the real line numbers it has on each side. `[]` for a malformed header.
 * The one counter every line lookup and renumbering shares.
 */
export function hunkLinesOf(hunk: Hunk): HunkLine[] {
  const parsed = parseHeader(hunk.header)
  if (!parsed) return []
  let oldLine = parsed.oldStart
  let newLine = parsed.newStart
  const lines: HunkLine[] = []
  for (const [index, text] of bodyLinesOf(hunk).entries()) {
    const kind = lineKindOf(text)
    if (kind === null) continue
    lines.push({ index, kind, oldLine, newLine })
    if (kind !== 'add') oldLine += 1
    if (kind !== 'del') newLine += 1
  }
  return lines
}

/** Builds a hunk from its header line and body lines. */
export function hunkFrom(header: string, body: readonly string[]): Hunk {
  return { header, text: `${[header, ...body].join('\n')}\n` }
}

/**
 * Splits one file's unified diff into hunks, dropping the `diff --git`/index/---/+++ preamble.
 * Each hunk's `text` starts at its `@@ … @@` header and runs to just before the next header (or
 * the diff's end), joined with '\n' and ending with '\n'.
 */
export function hunksOf(diff: string): Hunk[] {
  const lines = diff.split('\n')
  const starts: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if ((lines[i] as string).startsWith('@@')) starts.push(i)
  }
  return starts.map((from, index) => {
    const to = index + 1 < starts.length ? (starts[index + 1] as number) : lines.length
    const body = lines.slice(from, to)
    // split('\n') on a diff ending with '\n' leaves one trailing '': drop it, not a real line
    if (to === lines.length && body.length > 0 && body[body.length - 1] === '') body.pop()
    return { header: lines[from] as string, text: `${body.join('\n')}\n` }
  })
}

/**
 * Truncates a hunk's text to at most `max` chars (default 10000, the engine's Code cap) at a line
 * boundary, appending a ' … (N more lines)' marker when cut.
 */
/** Enough for ` … (N more lines)` with any realistic N. */
const MARKER_ROOM = 32

export function clampHunk(hunk: Hunk, max = ELEMENT_TEXT_LIMIT): Hunk {
  if (hunk.text.length <= max) return hunk
  // Leave room for the marker line, which counts against the same cap.
  const headerEnd = hunk.text.indexOf('\n')
  const cut = Math.max(headerEnd, hunk.text.lastIndexOf('\n', max - MARKER_ROOM))
  const kept = cut >= 0 ? hunk.text.slice(0, cut + 1) : ''
  const rest = cut >= 0 ? hunk.text.slice(cut + 1) : hunk.text
  const more = rest.split('\n').length - 1
  return { header: hunk.header, text: `${kept} … (${more} more lines)\n` }
}

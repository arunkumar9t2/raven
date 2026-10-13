import { widthOf } from '../../ui/wrap'
import type { SideLine, SplitRow } from './split'
import type { Seg } from './word-diff'

/** A line longer than this is cut before it is drawn: no pane is this wide, and the cap bounds an element. */
export const LINE_CAP = 1000

export const capLine = (text: string): string =>
  text.length > LINE_CAP ? text.slice(0, LINE_CAP) : text

/** `text` without the control characters an element refuses; a tab stays (a `Code` takes it). */
export function cleanTextOf(text: string): string {
  let out = ''
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const isControl = code < 32 || code === 127 || (code >= 128 && code <= 159)
    if (code === 9 || !isControl) out += char
  }
  return out
}

export const expandTabs = (text: string): string => text.split('\t').join('    ')

/** A line as a `Text` draws it: clean, tabs spaced out, capped. */
export const plainOf = (text: string): string => capLine(expandTabs(cleanTextOf(text)))

/** A line as a `Code` source draws it: clean and capped, tabs kept. */
export const codeTextOf = (text: string): string => capLine(cleanTextOf(text))

/** `glyph` on each of `rows` lines, for a one-column strip as tall as a run. */
export const columnOf = (glyph: string, rows: number): string =>
  Array.from({ length: Math.max(0, rows) }, () => glyph).join('\n')

/** Rows [from, to) of a row list that are all context or all change. */
export type Run = { kind: SplitRow['kind']; from: number; to: number }

/** Cuts rows into runs of one kind: a context run draws on both sides, a change run pairs removed with added. */
export function runsOf(rows: readonly SplitRow[]): Run[] {
  const runs: Run[] = []
  rows.forEach((row, index) => {
    const last = runs.at(-1)
    if (last && last.kind === row.kind) last.to = index + 1
    else runs.push({ kind: row.kind, from: index, to: index + 1 })
  })
  return runs
}

/**
 * Cuts rows into `[from, to)` pieces so that, on each side, the pieces' source (each line plus its
 * newline) stays within `limit` characters: the engine refuses a `Code` over 10 000. Both sides
 * cut at the same rows, which keeps the two columns aligned; every piece takes at least one row.
 */
export function piecesOf(rows: readonly SplitRow[], limit: number): [number, number][] {
  const costOf = (line: SideLine | null) => (line ? codeTextOf(line.text).length + 1 : 0)
  const pieces: [number, number][] = []
  let start = 0
  let left = 0
  let right = 0
  rows.forEach((row, index) => {
    const l = costOf(row.left)
    const r = costOf(row.right)
    if (index > start && (left + l > limit || right + r > limit)) {
      pieces.push([start, index])
      start = index
      left = 0
      right = 0
    }
    left += l
    right += r
  })
  if (rows.length > 0) pieces.push([start, rows.length])
  return pieces
}

/** The two sides of a `width`-column body, a one-column divider between them. */
export function sideWidthsOf(width: number): { left: number; right: number } {
  const usable = Math.max(2, width - 1)
  const left = Math.floor(usable / 2)
  return { left, right: usable - left }
}

/** One side of a row drawn as text: the gutter, the (possibly word-split) text, and the fill to the side's edge. */
export type SideCell = { prefix: string; segs: readonly Seg[]; pad: string }

/**
 * `line` as a cell `width` columns wide: its mark and right-aligned number (`gutter` digits), a
 * space, then the text, the rest padded with spaces so a background fills the whole side. `segs`
 * (a word diff of `plainOf(line.text)`) replace the one plain segment when given. A line wider
 * than the side gets no pad; the `Text` truncates it.
 */
export function sideCellOf(
  line: SideLine,
  gutter: number,
  width: number,
  segs?: readonly Seg[],
): SideCell {
  const prefix = `${line.mark}${String(line.n).padStart(gutter)} `
  const body: readonly Seg[] = segs ?? [{ text: plainOf(line.text), changed: false }]
  const used = widthOf(prefix) + body.reduce((sum, seg) => sum + widthOf(seg.text), 0)
  return { prefix, segs: body, pad: ' '.repeat(Math.max(0, width - used)) }
}

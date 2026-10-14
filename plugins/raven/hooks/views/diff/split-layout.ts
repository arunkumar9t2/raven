import { widthOf } from '../../ui/wrap'
import type { SideLine } from './split'
import type { Seg } from './word-diff'

/** A line longer than this is cut before it is drawn: no pane is this wide, and the cap bounds an element. */
export const LINE_CAP = 1000

export function capLine(text: string): string {
  if (text.length <= LINE_CAP) return text
  const last = text.charCodeAt(LINE_CAP - 1)
  // Never end on a lone high surrogate: drop it with the emoji it started.
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? LINE_CAP - 1 : LINE_CAP)
}

/** `text` without the control characters an element refuses; a tab stays (`plainOf` spaces it via `expandTabs`). */
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

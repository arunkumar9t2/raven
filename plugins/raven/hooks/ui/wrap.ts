import { widthOf, wrapSpans } from './table-layout'

/**
 * Plain `text` wrapped at word boundaries to `width` terminal cells (a word longer than a line
 * breaks hard; a `\n` starts a new line), at most `maxLines` lines; when text is cut, the last
 * line ends with `…`. The first line wraps to `firstWidth` instead when given (it shares its row
 * with something else). One wrapper for the pane: this is `table-layout`'s, not a second one.
 */
export function wrapText(
  text: string,
  width: number,
  maxLines: number,
  firstWidth: number = width,
): string[] {
  const all = wrapSpans([{ text: text.trimEnd(), style: 'plain' }], width, firstWidth).map(line =>
    line.map(span => span.text).join(''),
  )
  const limit = Math.max(1, maxLines)
  if (all.length <= limit) return all

  const lines = all.slice(0, limit)
  const last = lines.length - 1
  const room = Math.max(1, last === 0 ? Math.min(firstWidth, width) : width) - 1
  let cut = ''
  for (const char of [...(lines[last] as string)]) {
    if (widthOf(cut + char) > room) break
    cut += char
  }
  lines[last] = `${cut.trimEnd()}…`
  return lines
}

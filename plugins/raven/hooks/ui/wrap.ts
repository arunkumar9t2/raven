/**
 * Text measurement and word wrap in terminal cells, pure: display width, styled spans wrapped to a
 * width (a word longer than a line breaks hard, preferring a `/`, `.`, `-` or `_`), and `wrapText`
 * for plain strings. The one wrapper for the pane — table cells and note cards both use it.
 */

export type SpanStyle = 'plain' | 'bold' | 'code'
export type Span = { text: string; style: SpanStyle }
/** One wrapped line of a cell. */
export type CellLine = Span[]

/** Display width of one code point: 0 for combining/zero-width, 2 for wide (CJK, emoji), else 1. */
function pointWidth(cp: number): number {
  if (
    (cp >= 0x300 && cp <= 0x36f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0x2060
  )
    return 0
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
    return 2
  return 1
}

/** Display width of `text` in terminal cells. */
export function widthOf(text: string): number {
  let width = 0
  for (const char of text) width += pointWidth(char.codePointAt(0) ?? 0)
  return width
}

export type Word = Span[]

export const wordWidth = (word: Word) => word.reduce((sum, span) => sum + widthOf(span.text), 0)

/** Spans split into hard lines (`\n`), each into words (runs without whitespace, styles kept). */
export function wordLinesOf(spans: readonly Span[]): Word[][] {
  const lines: Word[][] = [[]]
  let word: Word = []
  const endWord = () => {
    if (word.length > 0) (lines[lines.length - 1] as Word[]).push(word)
    word = []
  }
  for (const span of spans) {
    for (const part of span.text.split(/(\s+)/)) {
      if (part === '') continue
      if (/^\s+$/.test(part)) {
        endWord()
        if (part.includes('\n')) for (const _ of part.match(/\n/g) ?? []) lines.push([])
      } else {
        word.push({ text: part, style: span.style })
      }
    }
  }
  endWord()
  return lines
}

/**
 * Cuts `word` into pieces of at most `width` cells, styles kept. A piece ends after the last `/`
 * that fits (else the last `.`, `-` or `_`) when one does, so a path wraps at a separator; with
 * none it breaks hard at the width.
 */
function breakWord(word: Word, width: number): Word[] {
  const chars = word.flatMap(span =>
    [...span.text].map(char => ({ char, style: span.style, w: widthOf(char) })),
  )
  const pieces: Word[] = []
  let start = 0
  while (start < chars.length) {
    let used = 0
    let end = start
    while (end < chars.length && used + (chars[end]?.w ?? 0) <= width) {
      used += chars[end]?.w ?? 0
      end += 1
    }
    if (end === start) end += 1 // a char wider than the column still takes a line
    if (end < chars.length) {
      const fitting = chars.slice(start, end)
      const lastOf = (set: string) => fitting.findLastIndex(c => set.includes(c.char))
      const at = lastOf('/') >= 0 ? lastOf('/') : lastOf('.-_')
      if (at >= 0) end = start + at + 1
    }
    const piece: Word = []
    for (const c of chars.slice(start, end)) {
      const last = piece[piece.length - 1]
      if (last && last.style === c.style) last.text += c.char
      else piece.push({ text: c.char, style: c.style })
    }
    pieces.push(piece)
    start = end
  }
  return pieces
}

const mergeSpans = (spans: Span[]): Span[] => {
  const out: Span[] = []
  for (const span of spans) {
    const last = out[out.length - 1]
    if (last && last.style === span.style) last.text += span.text
    else out.push({ ...span })
  }
  return out
}

function wrapWords(words: readonly Word[], width: number, firstWidth = width): CellLine[] {
  const lines: CellLine[] = []
  // The first line may be narrower (a caller sharing its row with something else).
  const room = () => (lines.length === 0 ? firstWidth : width)
  let line: Span[] = []
  let used = 0
  const finish = () => {
    lines.push(mergeSpans(line))
    line = []
    used = 0
  }
  for (const word of words) {
    const w = wordWidth(word)
    if (line.length > 0 && used + 1 + w <= room()) {
      line.push({ text: ' ', style: 'plain' }, ...word)
      used += 1 + w
      continue
    }
    if (line.length > 0) finish()
    if (w <= room()) {
      line = [...word]
      used = w
    } else {
      const pieces = breakWord(word, room())
      for (const [index, piece] of pieces.entries()) {
        line = [...piece]
        used = wordWidth(piece)
        if (index < pieces.length - 1) finish()
      }
    }
  }
  if (line.length > 0 || lines.length === 0) finish()
  return lines
}

/**
 * A cell's spans wrapped to `width` (hard `\n` breaks kept); always at least one line. The very
 * first line wraps to `firstWidth` instead, when given.
 */
export function wrapSpans(
  spans: readonly Span[],
  width: number,
  firstWidth: number = width,
): CellLine[] {
  const w = Math.max(1, width)
  const first = Math.max(1, Math.min(firstWidth, w))
  return wordLinesOf(spans).flatMap((words, index) => wrapWords(words, w, index === 0 ? first : w))
}

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
  // Cut the last line to `room` cells (one is left for the ellipsis), summing widths as it goes.
  let cut = ''
  let used = 0
  for (const char of [...(lines[last] as string)]) {
    const w = widthOf(char)
    if (used + w > room) break
    cut += char
    used += w
  }
  lines[last] = `${cut.trimEnd()}…`
  return lines
}

/**
 * GFM table layout, pure: the engine's `Markdown` sizes a table to the terminal, not the pane, so
 * Raven draws tables itself, fitted to the pane width. This module turns a parsed table and an
 * available width into column widths and wrapped, styled cell lines (`layoutTable`), then into the
 * drawn rows (`drawnRowsOf`) the `table` component paints and `linesOf` flattens to plain text.
 */

export type Align = 'left' | 'center' | 'right'

/** A parsed GFM table: raw cell markdown, ragged rows already fitted to the header's width. */
export type TableData = { header: string[]; align: Align[]; rows: string[][] }

export type SpanStyle = 'plain' | 'bold' | 'code'
export type Span = { text: string; style: SpanStyle }
/** One wrapped line of a cell. */
export type CellLine = Span[]

export type GridLayout = {
  kind: 'grid'
  widths: number[]
  align: Align[]
  header: CellLine[][]
  rows: CellLine[][][]
}
/** The narrow-pane fallback: one group of `Header: value` lines per row. */
export type RecordsLayout = { kind: 'records'; groups: CellLine[][] }
export type TableLayout = GridLayout | RecordsLayout

export type PieceStyle = SpanStyle | 'border'
export type Piece = { text: string; style: PieceStyle }
/** One drawn terminal line, as styled pieces. */
export type DrawnLine = Piece[]

const MIN_COLUMN = 6
const WORD_CAP = 20

// ── inline markdown ──────────────────────────────────────────────────────────────────────────

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

const isWordChar = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char)

/**
 * A cell's inline markdown as styled spans: `**bold**` and `` `code` `` keep a style; links draw as
 * their text, `*x*`/`_x_`/`~~x~~` as `x`, `\x` as `x`, `<br>` as a newline. Markers never appear in
 * the output, so span text is the visible text.
 */
export function spansOf(markdown: string): Span[] {
  const spans: Span[] = []
  const push = (text: string, style: SpanStyle) => {
    if (text === '') return
    const last = spans[spans.length - 1]
    if (last && last.style === style) last.text += text
    else spans.push({ text, style })
  }

  const walk = (text: string, bold: boolean) => {
    const base: SpanStyle = bold ? 'bold' : 'plain'
    let plain = ''
    const flush = () => {
      push(plain, base)
      plain = ''
    }
    let i = 0
    while (i < text.length) {
      const rest = text.slice(i)
      const char = text[i] as string
      const prev = text[i - 1]
      const escaped = char === '\\' && /[\\`*_{}[\]()#+\-.!|~<>]/.test(text[i + 1] ?? '')
      const br = /^<br\s*\/?>/i.exec(rest)
      const code = /^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/.exec(rest)
      const strong =
        char === '*' || !isWordChar(prev) ? /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest) : null
      const strike = /^~~(?=\S)([\s\S]*?\S)~~/.exec(rest)
      const link =
        /^\[((?:[^\][]|\[[^\]]*\])*)\]\(([^()\s]*(?:\([^()]*\)[^()\s]*)*)(?:\s+"[^"]*")?\)/.exec(
          rest,
        )
      const star = /^\*(?=[^\s*])([\s\S]*?[^\s*])\*(?!\*)/.exec(rest)
      const under =
        char === '_' && !isWordChar(prev)
          ? /^_(?=[^\s_])([\s\S]*?[^\s_])_(?![\p{L}\p{N}_])/u.exec(rest)
          : null

      if (escaped) {
        plain += text[i + 1]
        i += 2
      } else if (br) {
        plain += '\n'
        i += br[0].length
      } else if (code) {
        flush()
        push((code[2] as string).replace(/\n/g, ' ').replace(/^ (.*) $/, '$1'), 'code')
        i += code[0].length
      } else if (strong) {
        flush()
        walk(strong[2] as string, true)
        i += strong[0].length
      } else if (strike || link || star || under) {
        const found = (strike ?? link ?? star ?? under) as RegExpExecArray
        flush()
        walk(found[1] as string, bold)
        i += found[0].length
      } else {
        plain += char
        i += 1
      }
    }
    flush()
  }

  walk(markdown, false)
  return spans
}

// ── wrapping ─────────────────────────────────────────────────────────────────────────────────

type Word = Span[]

const wordWidth = (word: Word) => word.reduce((sum, span) => sum + widthOf(span.text), 0)

/** Spans split into hard lines (`\n`), each into words (runs without whitespace, styles kept). */
function wordLinesOf(spans: readonly Span[]): Word[][] {
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

// ── layout ───────────────────────────────────────────────────────────────────────────────────

const lineWidth = (line: CellLine) => line.reduce((sum, span) => sum + widthOf(span.text), 0)

/** Shares `budget` cells among columns, each growing toward its natural width, proportionally. */
function distribute(min: number[], natural: number[], budget: number): number[] {
  const widths = [...min]
  let remaining = budget
  while (remaining > 0) {
    const growable = widths.flatMap((w, j) => ((natural[j] as number) > w ? [j] : []))
    if (growable.length === 0) break
    const total = growable.reduce((sum, j) => sum + (natural[j] as number), 0)
    let granted = 0
    for (const j of growable) {
      const want = Math.floor((remaining * (natural[j] as number)) / total)
      const give = Math.min(want, (natural[j] as number) - (widths[j] as number))
      widths[j] = (widths[j] as number) + give
      granted += give
    }
    if (granted === 0) {
      // Shares rounded to nothing: hand single cells to the columns furthest from their natural.
      const order = [...growable].sort(
        (a, b) =>
          (natural[b] as number) -
          (widths[b] as number) -
          ((natural[a] as number) - (widths[a] as number)),
      )
      for (const j of order) {
        if (remaining === 0) break
        widths[j] = (widths[j] as number) + 1
        remaining -= 1
      }
    } else {
      remaining -= granted
    }
  }
  return widths
}

/**
 * Fits `table` to `width` cells. Natural widths when the whole table fits; else columns shrink
 * (never below `min(natural, max(6, longest word capped at 20))`) and cells wrap; when even those
 * minimums overflow, a records layout.
 */
export function layoutTable(table: TableData, width: number): TableLayout {
  const count = table.header.length
  const all = [table.header, ...table.rows].map(row => row.map(cell => spansOf(cell)))
  const overhead = 3 * count + 1

  const natural = Array.from({ length: count }, (_, j) =>
    Math.max(
      1,
      ...all.flatMap(row => wrapSpans(row[j] ?? [], Number.MAX_SAFE_INTEGER).map(lineWidth)),
    ),
  )

  let widths: number[] | null = null
  if (natural.reduce((a, b) => a + b, 0) + overhead <= width) {
    widths = natural
  } else {
    const min = natural.map((n, j) => {
      const longest = Math.max(
        0,
        ...all.flatMap(row => wordLinesOf(row[j] ?? []).flatMap(words => words.map(wordWidth))),
      )
      return Math.min(n, Math.max(MIN_COLUMN, Math.min(WORD_CAP, longest)))
    })
    const budget = width - overhead - min.reduce((a, b) => a + b, 0)
    if (budget >= 0) widths = distribute(min, natural, budget)
  }

  const [headerCells = [], ...bodyCells] = all
  if (widths === null) {
    const labels = table.header.map((cell, j) => {
      const label = spansOf(cell)
        .map(span => span.text)
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
      return label === '' ? `Column ${j + 1}` : label
    })
    const groups = bodyCells.map(row =>
      row.flatMap((cell, j) =>
        wrapSpans(
          [{ text: `${labels[j]}: `, style: 'bold' as const }, ...cell],
          Math.max(1, width),
        ),
      ),
    )
    return { kind: 'records', groups }
  }

  const fitted = widths
  return {
    kind: 'grid',
    widths: fitted,
    align: table.align,
    header: headerCells.map((cell, j) => wrapSpans(cell, fitted[j] as number)),
    rows: bodyCells.map(row => row.map((cell, j) => wrapSpans(cell, fitted[j] as number))),
  }
}

// ── drawing ──────────────────────────────────────────────────────────────────────────────────

const pad = (n: number): Piece => ({ text: ' '.repeat(n), style: 'plain' })

function aligned(line: CellLine, width: number, align: Align, bold: boolean): Piece[] {
  const slack = Math.max(0, width - lineWidth(line))
  const left = align === 'right' ? slack : align === 'center' ? Math.floor(slack / 2) : 0
  const pieces: Piece[] = line.map(span => ({
    text: span.text,
    style: bold && span.style === 'plain' ? 'bold' : span.style,
  }))
  return [pad(left), ...pieces, pad(slack - left)].filter(piece => piece.text !== '')
}

/** The drawn lines of a layout: borders, padding and styled cell text, in order. */
export function drawnRowsOf(layout: TableLayout): DrawnLine[] {
  if (layout.kind === 'records') {
    return layout.groups.flatMap((group, index) => [
      ...(index > 0 ? [[] as DrawnLine] : []),
      ...group.map(line => line.map(span => ({ text: span.text, style: span.style }))),
    ])
  }
  const border = (text: string): Piece => ({ text, style: 'border' })
  const rule = (left: string, mid: string, right: string): DrawnLine => [
    border(left + layout.widths.map(w => '─'.repeat(w + 2)).join(mid) + right),
  ]
  const band = (cells: CellLine[][], isHeader: boolean): DrawnLine[] => {
    const height = Math.max(1, ...cells.map(cell => cell.length))
    return Array.from({ length: height }, (_, k) => {
      const line: DrawnLine = [border('│')]
      cells.forEach((cell, j) => {
        const w = layout.widths[j] as number
        line.push(
          pad(1),
          ...aligned(cell[k] ?? [], w, isHeader ? 'center' : (layout.align[j] ?? 'left'), isHeader),
          pad(1),
          border('│'),
        )
      })
      return line
    })
  }
  const lines: DrawnLine[] = [rule('┌', '┬', '┐'), ...band(layout.header, true)]
  for (const row of layout.rows) lines.push(rule('├', '┼', '┤'), ...band(row, false))
  // With no body the header's underline is still the divider; the bottom closes the box.
  lines.push(rule('└', '┴', '┘'))
  return lines
}

/** Plain text of every drawn line — what the screen shows, for tests to measure. */
export function linesOf(layout: TableLayout): string[] {
  return drawnRowsOf(layout).map(line => line.map(piece => piece.text).join(''))
}

/**
 * GFM table layout, pure: the engine's `Markdown` sizes a table to the terminal, not the pane, so
 * Raven draws tables itself, fitted to the pane width. This module turns a parsed table and an
 * available width into column widths and wrapped, styled cell lines (`layoutTable`), then into the
 * drawn rows (`drawnRowsOf`) the `table` component paints.
 */

import {
  type CellLine,
  type Span,
  type SpanStyle,
  widthOf,
  wordLinesOf,
  wordWidth,
  wrapSpans,
} from './wrap'

export type { CellLine, Span, SpanStyle }

export type Align = 'left' | 'center' | 'right'

/** A parsed GFM table: raw cell markdown, ragged rows already fitted to the header's width. */
export type TableData = { header: string[]; align: Align[]; rows: string[][] }

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

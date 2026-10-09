import { ELEMENT_TEXT_LIMIT } from '../core/view'
import type { Align, TableData } from '../ui/table-layout'

const FENCE = /^\s*(`{3,}|~{3,})/

/**
 * CommonMark: a fence closes on a line that is only the marker's character, at least as long as
 * the opener, with nothing but whitespace around it: an info string (e.g. a ```ts` line nested
 * inside a ``` block) carries no closing, it is content.
 */
export function closesFence(line: string, marker: string): boolean {
  const char = marker[0]
  const body = char === '`' ? '`+' : '~+'
  return new RegExp(`^\\s*${body}\\s*$`).test(line) && line.trim().length >= marker.length
}

/**
 * Splits markdown into pieces of at most `max` characters, each drawn as its own `Markdown`
 * element. Cuts fall on blank lines outside code fences, so blocks stay whole; a single block
 * longer than `max` is cut between lines, a code fence closed and reopened across the cut.
 */
export function markdownChunksOf(markdown: string, max = ELEMENT_TEXT_LIMIT): string[] {
  const chunks: string[] = []
  let lines: string[] = []
  let size = 0
  let fence: string | null = null

  const flush = () => {
    const text = lines.join('\n').trim()
    if (text !== '') chunks.push(text)
    lines = []
    size = 0
  }

  for (const line of markdown.split('\n')) {
    const cost = line.length + 1
    // Room for the closing fence a cut inside a code block adds.
    const reserve = fence === null ? 0 : fence.length + 1

    if (size + cost + reserve > max && lines.length > 0) {
      const open = fence
      if (open) lines.push(open)
      flush()
      if (open) lines.push(open)
      size = lines.reduce((sum, each) => sum + each.length + 1, 0)
    }

    lines.push(line.length > max - 8 ? `${line.slice(0, max - 9)}…` : line)
    size += cost

    const marker = FENCE.exec(line)?.[1]
    if (fence === null) {
      if (marker) fence = marker
    } else if (closesFence(line, fence)) {
      fence = null
    }

    const isBoundary = fence === null && line.trim() === ''
    if (isBoundary && size > max / 2) flush()
  }

  flush()
  return chunks
}

/** A GFM table: its parsed cells (`TableData`) tagged for the doc pane to lay out. */
export type TableBlock = { kind: 'table' } & TableData

/** One drawable piece of a markdown chunk: prose for `Markdown`, or a fenced block for `Code`. */
export type DocBlock =
  | { kind: 'markdown'; text: string }
  | { kind: 'code'; text: string; language?: string }
  | TableBlock

/** Splits a table row on its unescaped pipes (outer pipes optional); `\|` is a literal pipe. */
function rowCellsOf(line: string): string[] {
  let text = line.trim()
  if (text.startsWith('|')) text = text.slice(1)
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1)
  const cells: string[] = []
  let cell = ''
  for (let i = 0; i < text.length; i++) {
    const char = text[i] as string
    if (char === '\\' && text[i + 1] === '|') {
      cell += '|'
      i += 1
    } else if (char === '|') {
      cells.push(cell.trim())
      cell = ''
    } else {
      cell += char
    }
  }
  cells.push(cell.trim())
  return cells
}

const hasPipe = (line: string) => /(^|[^\\])\|/.test(line)

function alignsOf(line: string, count: number): Align[] | null {
  if (!hasPipe(line) && !/^\s*:?-+:?\s*$/.test(line)) return null
  const cells = rowCellsOf(line)
  if (cells.length !== count || !cells.every(cell => /^:?-+:?$/.test(cell))) return null
  return cells.map(cell =>
    cell.startsWith(':')
      ? cell.endsWith(':')
        ? 'center'
        : 'left'
      : cell.endsWith(':')
        ? 'right'
        : 'left',
  )
}

/** Prose lines as `markdown` blocks with each GFM table (header, delimiter row, body) split out. */
function proseBlocksOf(lines: readonly string[]): DocBlock[] {
  const blocks: DocBlock[] = []
  let prose: string[] = []
  const flush = () => {
    const text = prose.join('\n').trim()
    if (text !== '') blocks.push({ kind: 'markdown', text })
    prose = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string
    const delimiter = hasPipe(line) ? lines[i + 1] : undefined
    const header = delimiter === undefined ? null : rowCellsOf(line)
    const align = header && delimiter !== undefined ? alignsOf(delimiter, header.length) : null
    if (!header || !align) {
      prose.push(line)
      continue
    }
    flush()
    const rows: string[][] = []
    let j = i + 2
    for (; j < lines.length; j++) {
      const body = lines[j] as string
      if (body.trim() === '' || !hasPipe(body)) break
      const cells = rowCellsOf(body).slice(0, header.length)
      while (cells.length < header.length) cells.push('')
      rows.push(cells)
    }
    blocks.push({ kind: 'table', header, align, rows })
    i = j - 1
  }
  flush()
  return blocks
}

/**
 * Splits one chunk (as `markdownChunksOf` cut it, fences balanced or running to the end) into
 * prose and fenced code, in order. Empty prose between blocks is dropped.
 */
export function docBlocksOf(chunk: string): DocBlock[] {
  const blocks: DocBlock[] = []
  let prose: string[] = []
  let code: string[] = []
  let fence: { marker: string; language?: string } | null = null

  const flushProse = () => {
    blocks.push(...proseBlocksOf(prose))
    prose = []
  }

  for (const line of chunk.split('\n')) {
    const match = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/.exec(line)
    if (fence === null && match?.[1]) {
      flushProse()
      fence = match[2] ? { marker: match[1], language: match[2] } : { marker: match[1] }
    } else if (fence !== null && closesFence(line, fence.marker)) {
      blocks.push({
        kind: 'code',
        text: code.join('\n'),
        ...(fence.language ? { language: fence.language } : {}),
      })
      code = []
      fence = null
    } else if (fence !== null) {
      code.push(line)
    } else {
      prose.push(line)
    }
  }
  if (fence !== null)
    blocks.push({
      kind: 'code',
      text: code.join('\n'),
      ...(fence.language ? { language: fence.language } : {}),
    })
  flushProse()
  return blocks
}

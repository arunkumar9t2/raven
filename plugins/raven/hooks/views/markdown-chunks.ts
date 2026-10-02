import { ELEMENT_TEXT_LIMIT } from '../core/view'

const FENCE = /^\s*(`{3,}|~{3,})/

/**
 * CommonMark: a fence closes on a line that is only the marker's character, at least as long as
 * the opener, with nothing but whitespace around it — an info string (e.g. a ```ts` line nested
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

/** One drawable piece of a markdown chunk: prose for `Markdown`, or a fenced block for `Code`. */
export type DocBlock =
  | { kind: 'markdown'; text: string }
  | { kind: 'code'; text: string; language?: string }

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
    const text = prose.join('\n').trim()
    if (text !== '') blocks.push({ kind: 'markdown', text })
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

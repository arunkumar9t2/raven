import { ELEMENT_TEXT_LIMIT } from '../core/view'

const FENCE = /^\s*(`{3,}|~{3,})/

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
    if (marker) fence = fence === null ? marker : line.trim().startsWith(fence) ? null : fence

    const isBoundary = fence === null && line.trim() === ''
    if (isBoundary && size > max / 2) flush()
  }

  flush()
  return chunks
}

import { closesFence, trimBlankLines } from './markdown-chunks'

/**
 * One commentable section of a markdown doc: its heading (TOP_SECTION before the first), the
 * heading's level (1 to 6 by its hashes; 0 for the text above the first heading) and text.
 */
export type DocSection = { heading: string; level: number; text: string }

/** The section name for text above a doc's first heading. */
export const TOP_SECTION = '(top)'

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/
const FENCE = /^\s*(`{3,}|~{3,})/

/**
 * Cuts markdown at its ATX headings outside code fences; each section keeps its heading line.
 * Empty sections (a blank top before the first heading) are dropped.
 */
export function docSectionsOf(markdown: string): DocSection[] {
  const sections: DocSection[] = []
  let heading = TOP_SECTION
  let level = 0
  let lines: string[] = []
  let fence: string | null = null

  const flush = () => {
    // Blank lines go from both ends, but not a first line's indent (an indented code block).
    const text = trimBlankLines(lines.join('\n'))
    if (text.trim() !== '') sections.push({ heading, level, text })
    lines = []
  }

  for (const line of markdown.split('\n')) {
    const marker = FENCE.exec(line)?.[1]
    if (fence === null) {
      if (marker) fence = marker
    } else if (closesFence(line, fence)) {
      fence = null
    }
    const match = fence === null ? HEADING.exec(line) : null
    if (match && !marker) {
      flush()
      heading = match[2]?.trim() ?? ''
      level = match[1]?.length ?? 1
    }
    lines.push(line)
  }
  flush()
  return sections
}

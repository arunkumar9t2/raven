/** The text `/raven` answers when the terminal is too narrow to dock the pane. */
export const NARROW_TEXT = 'Widen the terminal to dock the Raven pane'
const FAILED_PREFIX = 'Raven failed:'
const USAGE_PREFIX = 'Usage: /raven'

/**
 * Which glyph leads a `/raven` command's output row: `!` for a narrow terminal, a thrown error or
 * usage help; `◇` for a pane hidden or nothing to send; `◆` for a pane shown or the review sent.
 */
export function commandGlyphOf(text: string, isErrored: boolean): string {
  if (
    isErrored ||
    text === NARROW_TEXT ||
    text.startsWith(FAILED_PREFIX) ||
    text.startsWith(USAGE_PREFIX)
  )
    return '!'
  if (text.endsWith(' hidden') || text === 'No review comments to send') return '◇'
  return '◆'
}

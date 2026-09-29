/** The text `/raven` answers when the terminal is too narrow to dock the pane. */
export const NARROW_TEXT = 'Widen the terminal to dock the Raven pane'

/**
 * What a `/raven` command run resolved to. `info` is the fallback for a `CommandOutput` row whose
 * text no `command()` call in this session produced (a replayed transcript, a reloaded module).
 */
export type CommandKind = 'shown' | 'hidden' | 'narrow' | 'error' | 'info'

export type CommandResult = { kind: CommandKind; text: string }

const GLYPHS: Record<CommandKind, string> = {
  shown: '◆',
  hidden: '◇',
  narrow: '!',
  error: '!',
  info: '◆',
}

/** Which glyph leads a `/raven` command's output row, by its result's kind. */
export function commandGlyphOf(kind: CommandKind): string {
  return GLYPHS[kind]
}

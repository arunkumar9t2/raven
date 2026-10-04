import type { CommentStatus } from '../review/comments'
import type { TaskStatus } from '../review/tasks'

/**
 * Semantic colour names for Raven's chrome, each pinned to a Claude Code theme key so the tree
 * follows the person's active theme (light/dark, `/theme`, or a custom theme) with no code of its
 * own — see spec/mod-api.md "Colours and the theme". Views (and the kit in `hooks/ui/`) reference
 * `COLORS.x`, never a theme key or raw colour literal directly.
 */
export const COLORS = {
  /** Added lines/files, the `+N` count, and the `A`/`U` status marks. */
  added: 'diffAddedWord',
  /** Removed lines/files, the `−N` count, and the `D` status mark. */
  removed: 'diffRemovedWord',
  /** The `M` (modified) status mark. */
  modified: 'warning',
  /** The `R` (renamed) status mark and an existing review comment's text. */
  suggestion: 'suggestion',
  /** A read failure or an errored command result. */
  error: 'error',
  /** The one accent: the file being edited right now, a pane's primary action. */
  accent: 'claude',
  /** Resting chrome: rail and bar cells with nothing to say, a chip at rest. */
  inactive: 'inactive',
  /**
   * The tint Claude Code puts behind the person's own messages in the transcript: a note card
   * and the compose box are the person's message to Claude, so they sit on it.
   */
  userMessage: 'userMessageBackground',
  /** `progressBar`'s filled cells, and a pill that is on (a staged hunk). */
  done: 'success',
  /** Body text at full strength: a pill's label at rest. */
  text: 'text',
  /** The same tint under the pointer: a hovered list row (R41). */
  userMessageHover: 'userMessageBackgroundHover',
  /** A hovered pill's background and an active list row's background (R41). */
  selection: 'selectionBg',
  /** Text on a filled accent or error background: a primary or armed pill's label. */
  inverseText: 'inverseText',
} as const

/** A note's `CommentStatus` (`hooks/review/comments.ts`) to its card's `┃` bar and status-word colour. */
export const NOTE_STATE_COLORS: Record<CommentStatus, string> = {
  pending: COLORS.suggestion,
  sent: COLORS.inactive,
  addressed: COLORS.done,
  open: COLORS.modified,
} as const

/** A task's `TaskStatus` (`hooks/review/tasks.ts`) to its state-dot colour. */
export const TASK_STATE_COLORS: Record<TaskStatus, string> = {
  pending: COLORS.inactive,
  in_progress: COLORS.accent,
  completed: COLORS.done,
} as const

/** A task's `TaskStatus` to its state-dot glyph: open, half-full while working, filled when done. */
export const TASK_STATE_GLYPHS: Record<TaskStatus, string> = {
  pending: '○',
  in_progress: '◐',
  completed: '●',
} as const

/** A pill's visual kind (`ui/strip.tsx`): the colours it draws at rest and under the pointer. */
export type PillKind = 'normal' | 'primary' | 'danger' | 'armed' | 'on'

/**
 * Each pill kind's text colour, background and hover pair, by theme key only. Normal rests on the
 * user-message tint and lights to the selection tint (R41); primary is the accent fill; danger is error-
 * coloured text; armed (a confirm waiting for its second press) is a filled error pill; on is a
 * succeeded state (staged).
 */
export const PILL_COLORS: Record<
  PillKind,
  { c: string; bg: string; hoverC?: string; hoverBg: string }
> = {
  normal: { c: COLORS.text, bg: COLORS.userMessage, hoverBg: COLORS.selection },
  primary: { c: COLORS.inverseText, bg: COLORS.accent, hoverBg: 'claudeShimmer' },
  danger: { c: COLORS.error, bg: COLORS.userMessage, hoverBg: COLORS.selection },
  armed: { c: COLORS.inverseText, bg: COLORS.error, hoverBg: COLORS.error },
  on: { c: COLORS.done, bg: COLORS.userMessage, hoverBg: COLORS.selection },
}

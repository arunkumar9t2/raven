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
  /** `progressBar`'s filled cells. */
  done: 'success',
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

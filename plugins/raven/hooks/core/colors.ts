/**
 * Semantic colour names for Raven's chrome, each pinned to a Claude Code theme key so the tree
 * follows the person's active theme (light/dark, `/theme`, or a custom theme) with no code of its
 * own — see spec/mod-api.md "Colours and the theme". Views reference `COLORS.x`, never a theme key
 * or raw colour literal directly.
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
} as const

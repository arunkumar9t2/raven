/** Where a comment is anchored, or a new one being typed: a file, or one of its hunks. */
export type Anchor = { path: string; hunk?: string }

export const sameAnchor = (a: Anchor | null, b: Anchor) => a?.path === b.path && a?.hunk === b.hunk

/** The one key derived from an anchor; every anchor-scoped key below builds on it. */
export const anchorKeyOf = (anchor: Anchor) => `${anchor.path}|${anchor.hunk ?? ''}`

/** The block key of an anchor's comment button or compose box. */
export const commentBoxKeyOf = (anchor: Anchor) => `comment-box:${anchorKeyOf(anchor)}`
/** The element key of the "＋ comment" button itself. */
export const commentButtonKeyOf = (anchor: Anchor) => `comment:${anchorKeyOf(anchor)}`
/** The element key of the cancel button under an open compose box. */
export const cancelKeyOf = (anchor: Anchor) => `cancel:${anchorKeyOf(anchor)}`
/** The element key of the compose Input, focused when composing starts. */
export const inputKeyOf = (anchor: Anchor) => `input:${anchorKeyOf(anchor)}`
/** The element key of the compose box's line-picker Select. */
export const selectKeyOf = (anchor: Anchor) => `select:${anchorKeyOf(anchor)}`

/** The block key of a comment's note row, keyed by comment id so removal keeps other rows put. */
export const noteKeyOf = (id: string) => `note:${id}`
/** The element key of a note's remove button. */
export const dropKeyOf = (id: string) => `drop:${id}`
/** The element key of an open note's resend button. */
export const resendKeyOf = (id: string) => `resend:${id}`
/** The block key of an anchor's collapsed "N addressed" row. */
export const addressedKeyOf = (anchor: Anchor) => `addressed:${anchorKeyOf(anchor)}`

/** The block key of a hunk's stage/revert row. */
export const hunkActionsKeyOf = (anchor: Anchor) => `hunk-actions:${anchorKeyOf(anchor)}`
/** The element key of a hunk's stage button. */
export const stageKeyOf = (anchor: Anchor) => `stage:${anchorKeyOf(anchor)}`
/** The element key of a hunk's revert button. */
export const revertKeyOf = (anchor: Anchor) => `revert:${anchorKeyOf(anchor)}`

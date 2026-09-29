/** Where a comment is anchored, or a new one being typed: a file, or one of its hunks. */
export type Anchor = { path: string; hunk?: string }

export const sameAnchor = (a: Anchor | null, b: Anchor) => a?.path === b.path && a?.hunk === b.hunk

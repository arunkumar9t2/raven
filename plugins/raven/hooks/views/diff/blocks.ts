import type { ChangedFile } from '../../git/changes'
import type { Hunk } from '../../git/hunks'
import type { Comments } from '../../review/comments'
import { commentsOn } from '../../review/comments'
import { type Anchor, sameAnchor } from './anchor'
import type { Block } from './layout'

export const TITLE_KEY = 'title'
export const STATUS_KEY = 'status'

const anchorKeyOf = (anchor: Anchor) => `${anchor.path}|${anchor.hunk ?? ''}`

/** The block key of a comment's note row, keyed by comment id so removal keeps other rows put. */
export const noteKeyOf = (id: string) => `note:${id}`

/** The block key of an anchor's comment button or compose box. */
export const commentBoxKeyOf = (anchor: Anchor) => `comment-box:${anchorKeyOf(anchor)}`

/** The block key of the blank row between hunk `index` and the one before it. */
export const gapKeyOf = (index: number) => `gap:${index}`

/** The block key of hunk `index`, unique even across hunks sharing a header (e.g. after a slice). */
export const hunkKeyOf = (index: number, hunk: Hunk) => `hunk:${index}:${hunk.header}`

function notesBlocksOf(comments: Comments, anchor: Anchor): Block[] {
  return commentsOn(comments, anchor.path, anchor.hunk).map(
    (comment): Block => ({ kind: 'fixed', key: noteKeyOf(comment.id), rows: 1 }),
  )
}

function commentBoxBlockOf(anchor: Anchor, composing: Anchor | null): Block {
  const rows = sameAnchor(composing, anchor) ? 2 : 1
  return { kind: 'fixed', key: commentBoxKeyOf(anchor), rows }
}

/**
 * The selected file's body as fixed-height and hunk blocks, top to bottom: the title, the
 * file-level notes and comment box, then each hunk with its own notes and comment box, one blank
 * row between hunks. A file with no hunks (loading, binary, or no textual changes) ends with one
 * status row instead.
 */
export function blocksOf(
  file: ChangedFile,
  hunks: readonly Hunk[] | undefined,
  comments: Comments,
  composing: Anchor | null,
): Block[] {
  const fileAnchor: Anchor = { path: file.path }

  const blocks: Block[] = [
    { kind: 'fixed', key: TITLE_KEY, rows: 1 },
    ...notesBlocksOf(comments, fileAnchor),
    commentBoxBlockOf(fileAnchor, composing),
  ]

  if (hunks === undefined || hunks.length === 0) {
    blocks.push({ kind: 'fixed', key: STATUS_KEY, rows: 1 })
    return blocks
  }

  hunks.forEach((hunk, index) => {
    if (index > 0) blocks.push({ kind: 'fixed', key: gapKeyOf(index), rows: 1 })
    const anchor: Anchor = { path: file.path, hunk: hunk.header }
    blocks.push({ kind: 'hunk', key: hunkKeyOf(index, hunk), hunk })
    blocks.push(...notesBlocksOf(comments, anchor))
    blocks.push(commentBoxBlockOf(anchor, composing))
  })

  return blocks
}

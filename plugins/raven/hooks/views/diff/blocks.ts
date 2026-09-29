import type { ChangedFile } from '../../git/changes'
import type { Hunk } from '../../git/hunks'
import type { Comment, Comments } from '../../review/comments'
import { commentsOn } from '../../review/comments'
import { type Anchor, commentBoxKeyOf, noteKeyOf, sameAnchor } from './anchor'
import type { Block } from './layout'

export { commentBoxKeyOf, noteKeyOf } from './anchor'

export const TITLE_KEY = 'title'
export const STATUS_KEY = 'status'

/** The fixed rows' payload: one variant per row kind a `Block` can carry. */
export type BodyItem =
  | { kind: 'title'; file: ChangedFile }
  | { kind: 'note'; comment: Comment }
  | { kind: 'comment-box'; anchor: Anchor }
  | { kind: 'gap' }
  | { kind: 'status'; text: string }

/** The block key of the blank row between hunk `index` and the one before it. */
export const gapKeyOf = (index: number) => `gap:${index}`

/** The block key of hunk `index`, unique even across hunks sharing a header (e.g. after a slice). */
export const hunkKeyOf = (index: number, hunk: Hunk) => `hunk:${index}:${hunk.header}`

function anchorBlocksOf(
  comments: Comments,
  anchor: Anchor,
  composing: Anchor | null,
): Block<BodyItem>[] {
  const notes = commentsOn(comments, anchor.path, anchor.hunk)
  const rows = sameAnchor(composing, anchor) ? 2 : 1

  return [
    ...notes.map(
      (comment): Block<BodyItem> => ({
        kind: 'fixed',
        key: noteKeyOf(comment.id),
        rows: 1,
        item: { kind: 'note', comment },
      }),
    ),
    { kind: 'fixed', key: commentBoxKeyOf(anchor), rows, item: { kind: 'comment-box', anchor } },
  ]
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
): Block<BodyItem>[] {
  const fileAnchor: Anchor = { path: file.path }

  const blocks: Block<BodyItem>[] = [
    { kind: 'fixed', key: TITLE_KEY, rows: 1, item: { kind: 'title', file } },
    ...anchorBlocksOf(comments, fileAnchor, composing),
  ]

  if (hunks === undefined || hunks.length === 0) {
    const text =
      hunks === undefined ? 'Loading…' : file.isBinary ? 'Binary file' : 'No textual changes'
    blocks.push({ kind: 'fixed', key: STATUS_KEY, rows: 1, item: { kind: 'status', text } })
    return blocks
  }

  hunks.forEach((hunk, index) => {
    if (index > 0) {
      blocks.push({ kind: 'fixed', key: gapKeyOf(index), rows: 1, item: { kind: 'gap' } })
    }
    const anchor: Anchor = { path: file.path, hunk: hunk.header }
    blocks.push({ kind: 'hunk', key: hunkKeyOf(index, hunk), hunk })
    blocks.push(...anchorBlocksOf(comments, anchor, composing))
  })

  return blocks
}

import type { ChangedFile } from '../../git/changes'
import type { Hunk } from '../../git/hunks'
import type { Comment, Comments } from '../../review/comments'
import { groupByAnchor } from '../../review/comments'
import {
  type Anchor,
  addressedKeyOf,
  anchorKeyOf,
  commentBoxKeyOf,
  hunkActionsKeyOf,
  noteKeyOf,
  sameAnchor,
} from './anchor'
import type { Block } from './layout'

export { addressedKeyOf, commentBoxKeyOf, hunkActionsKeyOf, noteKeyOf } from './anchor'

export const TITLE_KEY = 'title'
export const STATUS_KEY = 'status'
export const OUTDATED_TITLE_KEY = 'outdated-title'

/** The compose box's rows with no line picker (an Input and a cancel button). */
const COMPOSE_ROWS = 2
/** The compose box's rows on a hunk, where a line-picker Select draws above the Input. */
const COMPOSE_ROWS_WITH_PICKER = COMPOSE_ROWS + 1

/** The fixed rows' payload: one variant per row kind a `Block` can carry. */
export type BodyItem =
  | { kind: 'title'; file: ChangedFile; turnIndex?: number }
  | { kind: 'note'; comment: Comment }
  | { kind: 'addressed'; anchor: Anchor; count: number }
  | { kind: 'outdated-title' }
  | { kind: 'comment-box'; anchor: Anchor; hunk?: Hunk }
  | {
      kind: 'hunk-actions'
      anchor: Anchor
      hunk: Hunk
      isStaged: boolean
      confirmingRevert: boolean
    }
  | { kind: 'gap' }
  | { kind: 'status'; text: string }

/** A hunk's staged/confirming state, by its header, driving its stage/revert row. */
export type HunkState = { staged: ReadonlySet<string>; confirmingRevert: string | null }

const NO_HUNK_STATE: HunkState = { staged: new Set(), confirmingRevert: null }

/** The block key of the blank row between hunk `index` and the one before it. */
export const gapKeyOf = (index: number) => `gap:${index}`

/** The block key of hunk `index`, unique even across hunks sharing a header (e.g. after a slice). */
export const hunkKeyOf = (index: number, hunk: Hunk) => `hunk:${index}:${hunk.header}`

/** One anchor's notes (addressed ones collapsed to a single row) followed by its comment box. */
function anchorBlocksOf(
  notes: Comments,
  anchor: Anchor,
  composing: Anchor | null,
  hunk?: Hunk,
): Block<BodyItem>[] {
  const addressed = notes.filter(comment => comment.status === 'addressed')
  const visible = notes.filter(comment => comment.status !== 'addressed')
  const rows = sameAnchor(composing, anchor) ? (hunk ? COMPOSE_ROWS_WITH_PICKER : COMPOSE_ROWS) : 1

  const blocks: Block<BodyItem>[] = []
  if (addressed.length > 0) {
    blocks.push({
      kind: 'fixed',
      key: addressedKeyOf(anchor),
      rows: 1,
      item: { kind: 'addressed', anchor, count: addressed.length },
    })
  }
  blocks.push(
    ...visible.map(
      (comment): Block<BodyItem> => ({
        kind: 'fixed',
        key: noteKeyOf(comment.id),
        rows: 1,
        item: { kind: 'note', comment },
      }),
    ),
  )
  blocks.push({
    kind: 'fixed',
    key: commentBoxKeyOf(anchor),
    rows,
    item: { kind: 'comment-box', anchor, hunk },
  })
  return blocks
}

/** The outdated group: a dim title row, then each stale anchor's notes (no comment box). */
function outdatedBlocksOf(outdated: Comments): Block<BodyItem>[] {
  if (outdated.length === 0) return []

  const byHunk = new Map<string | undefined, Comment[]>()
  for (const comment of outdated) {
    const group = byHunk.get(comment.hunk)
    if (group) group.push(comment)
    else byHunk.set(comment.hunk, [comment])
  }

  const blocks: Block<BodyItem>[] = [
    { kind: 'fixed', key: OUTDATED_TITLE_KEY, rows: 1, item: { kind: 'outdated-title' } },
  ]
  for (const [hunk, group] of byHunk) {
    const anchor: Anchor = { path: group[0]?.path ?? '', hunk }
    const addressed = group.filter(comment => comment.status === 'addressed')
    const visible = group.filter(comment => comment.status !== 'addressed')
    if (addressed.length > 0) {
      blocks.push({
        kind: 'fixed',
        key: addressedKeyOf(anchor),
        rows: 1,
        item: { kind: 'addressed', anchor, count: addressed.length },
      })
    }
    blocks.push(
      ...visible.map(
        (comment): Block<BodyItem> => ({
          kind: 'fixed',
          key: noteKeyOf(comment.id),
          rows: 1,
          item: { kind: 'note', comment },
        }),
      ),
    )
  }
  return blocks
}

/** A turn's diff is read-only: no comment boxes, no stage/revert, just the title and hunks. */
export type BlocksOptions = {
  hunkState?: HunkState
  /** Set for a turn source: hides comment/stage/revert controls and titles the file "Turn N". */
  turnIndex?: number
}

/**
 * The selected file's body as fixed-height and hunk blocks, top to bottom: the title, the
 * file-level notes and comment box, then each hunk with its own notes, comment box and
 * stage/revert row, one blank row between hunks, then an "Outdated" group for comments whose
 * hunk no longer exists. A file with no hunks (loading, binary, or no textual changes) ends with
 * one status row instead. A turn source (`options.turnIndex` set) is read-only: no comment boxes,
 * no stage/revert rows.
 */
export function blocksOf(
  file: ChangedFile,
  hunks: readonly Hunk[] | undefined,
  comments: Comments,
  composing: Anchor | null,
  options: BlocksOptions = {},
): Block<BodyItem>[] {
  const hunkState = options.hunkState ?? NO_HUNK_STATE
  const isReadOnly = options.turnIndex !== undefined
  const fileAnchor: Anchor = { path: file.path }
  const grouped = groupByAnchor(comments, hunks?.map(hunk => hunk.header) ?? [])

  const blocks: Block<BodyItem>[] = [
    {
      kind: 'fixed',
      key: TITLE_KEY,
      rows: 1,
      item: { kind: 'title', file, turnIndex: options.turnIndex },
    },
    ...(isReadOnly ? [] : anchorBlocksOf(grouped.file, fileAnchor, composing)),
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
    if (isReadOnly) return
    blocks.push(...anchorBlocksOf(grouped.byHunk.get(hunk.header) ?? [], anchor, composing, hunk))
    blocks.push({
      kind: 'fixed',
      key: hunkActionsKeyOf(anchor),
      rows: 1,
      item: {
        kind: 'hunk-actions',
        anchor,
        hunk,
        isStaged: hunkState.staged.has(hunk.header),
        confirmingRevert: hunkState.confirmingRevert === anchorKeyOf(anchor),
      },
    })
  })

  if (!isReadOnly) blocks.push(...outdatedBlocksOf(grouped.outdated))

  return blocks
}

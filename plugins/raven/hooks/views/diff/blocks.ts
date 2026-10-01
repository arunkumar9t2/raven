import { type Capabilities, FULL_CAPABILITIES } from '../../core/view'
import type { ChangedFile } from '../../git/changes'
import type { Hunk } from '../../git/hunks'
import type { Comment, Comments } from '../../review/comments'
import { groupByAnchor } from '../../review/comments'
import {
  type Anchor,
  addressedKeyOf,
  commentBoxKeyOf,
  hunkActionsKeyOf,
  noteKeyOf,
  sameAnchor,
} from './anchor'
import type { Block } from './layout'
import { rowsOf } from './layout'

export const TITLE_KEY = 'title'
export const STATUS_KEY = 'status'
export const OUTDATED_TITLE_KEY = 'outdated-title'

/** The header's fixed row count (counts+source, then the action buttons) and the rule below it. */
const HEADER_ROWS = 2
const RULE_ROWS = 1

/** The fixed rows above the scrolling body: the header, the (capped) file list, and the rule. */
export function fixedRowsOf(fileCount: number, maxListRows: number): number {
  return HEADER_ROWS + Math.min(fileCount, maxListRows) + RULE_ROWS
}

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
  | { kind: 'hunk-actions'; anchor: Anchor; hunk: Hunk }
  | { kind: 'gap' }
  | { kind: 'status'; text: string }

/** The block key of the blank row between hunk `index` and the one before it. */
export const gapKeyOf = (index: number) => `gap:${index}`

/** The block key of hunk `index`, unique even across hunks sharing a header (e.g. after a slice). */
export const hunkKeyOf = (index: number, hunk: Hunk) => `hunk:${index}:${hunk.header}`

/** An anchor's notes: addressed ones collapsed to a single "N addressed" row, then each visible one. */
function notesBlocksOf(notes: Comments, anchor: Anchor): Block<BodyItem>[] {
  const addressed = notes.filter(comment => comment.status === 'addressed')
  const visible = notes.filter(comment => comment.status !== 'addressed')

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
  return blocks
}

/**
 * One anchor's notes followed by its comment box; no `Input` drops the box entirely (no controls
 * to draw), and no `Select` drops the line picker's row from a hunk box (whole-hunk comments only).
 */
function anchorBlocksOf(
  notes: Comments,
  anchor: Anchor,
  composing: Anchor | null,
  capabilities: Capabilities,
  hunk?: Hunk,
): Block<BodyItem>[] {
  const notesBlocks = notesBlocksOf(notes, anchor)
  if (!capabilities.canType) return notesBlocks

  const hasPicker = hunk !== undefined && capabilities.canPick
  const rows = sameAnchor(composing, anchor)
    ? hasPicker
      ? COMPOSE_ROWS_WITH_PICKER
      : COMPOSE_ROWS
    : 1
  return [
    ...notesBlocks,
    {
      kind: 'fixed',
      key: commentBoxKeyOf(anchor),
      rows,
      item: { kind: 'comment-box', anchor, hunk },
    },
  ]
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
    blocks.push(...notesBlocksOf(group, { path: group[0]?.path ?? '', hunk }))
  }
  return blocks
}

export type BlocksOptions = {
  /** A turn source's index, shown as the title ("Turn N") in place of the file path. */
  turnIndex?: number
  /** A turn's diff is read-only: no comment boxes, no stage/revert, just the title and hunks. */
  readOnly?: boolean
  /** The surface's `Input`/`Select`; every surface has both when omitted. */
  capabilities?: Capabilities
  /** The status for a file whose hunks are undefined; `Loading…` when omitted. */
  unreadText?: string
}

/**
 * The selected file's body as fixed-height and hunk blocks, top to bottom: the title, the
 * file-level notes and comment box, then each hunk with its own notes, comment box and
 * stage/revert row, one blank row between hunks, then an "Outdated" group for comments whose
 * hunk no longer exists. A file with no hunks (loading, binary, or no textual changes) ends with
 * one status row instead.
 */
export function blocksOf(
  file: ChangedFile,
  hunks: readonly Hunk[] | undefined,
  comments: Comments,
  composing: Anchor | null,
  options: BlocksOptions = {},
): Block<BodyItem>[] {
  const isReadOnly = options.readOnly ?? false
  const capabilities = options.capabilities ?? FULL_CAPABILITIES
  const fileAnchor: Anchor = { path: file.path }
  const own = comments.filter(comment => comment.path === file.path)
  const grouped = groupByAnchor(own, hunks?.map(hunk => hunk.header) ?? [])

  const blocks: Block<BodyItem>[] = [
    {
      kind: 'fixed',
      key: TITLE_KEY,
      rows: 1,
      item: { kind: 'title', file, turnIndex: options.turnIndex },
    },
    ...(isReadOnly ? [] : anchorBlocksOf(grouped.file, fileAnchor, composing, capabilities)),
  ]

  if (hunks === undefined || hunks.length === 0) {
    const text =
      hunks === undefined
        ? (options.unreadText ?? 'Loading…')
        : file.isBinary
          ? 'Binary file'
          : 'No textual changes'
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
    blocks.push(
      ...anchorBlocksOf(
        grouped.byHunk.get(hunk.header) ?? [],
        anchor,
        composing,
        capabilities,
        hunk,
      ),
    )
    blocks.push({
      kind: 'fixed',
      key: hunkActionsKeyOf(anchor),
      rows: 1,
      item: { kind: 'hunk-actions', anchor, hunk },
    })
  })

  if (!isReadOnly) blocks.push(...outdatedBlocksOf(grouped.outdated))

  return blocks
}

/** Every file's blocks in one scroll, with each file's title row for the list to jump to. */
export type Stream = {
  blocks: Block<BodyItem>[]
  titleRows: ReadonlyMap<string, number>
  contentRows: number
}

/**
 * The files' `blocksOf` one after another, a blank row between files; each block's key is
 * prefixed with its file's path so keys stay unique across the stream.
 */
export function streamOf(
  files: readonly ChangedFile[],
  hunksFor: (file: ChangedFile) => readonly Hunk[] | undefined,
  comments: Comments,
  composing: Anchor | null,
  options: BlocksOptions = {},
): Stream {
  const blocks: Block<BodyItem>[] = []
  const titleRows = new Map<string, number>()
  let row = 0
  files.forEach((each, index) => {
    if (index > 0) {
      blocks.push({ kind: 'fixed', key: `${each.path}#sep`, rows: 1, item: { kind: 'gap' } })
      row += 1
    }
    titleRows.set(each.path, row)
    for (const block of blocksOf(each, hunksFor(each), comments, composing, options)) {
      blocks.push({ ...block, key: `${each.path}#${block.key}` })
      row += rowsOf(block)
    }
  })
  return { blocks, titleRows, contentRows: row }
}

/** The file whose section holds `row`: the last title at or above it; null for an empty stream. */
export function fileAtRow(titleRows: ReadonlyMap<string, number>, row: number): string | null {
  let found: string | null = null
  for (const [path, start] of titleRows) if (start <= row) found = path
  return found
}

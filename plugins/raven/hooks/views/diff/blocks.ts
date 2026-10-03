import { type Capabilities, FULL_CAPABILITIES } from '../../core/view'
import type { ChangedFile } from '../../git/changes'
import { bodyLinesOf, type Hunk } from '../../git/hunks'
import type { Comment, Comments } from '../../review/comments'
import {
  type CommentStatus,
  groupByAnchor,
  lineKeyOf,
  lineRowsOf,
  splitAddressed,
} from '../../review/comments'
import {
  type Anchor,
  addressedKeyOf,
  commentBoxKeyOf,
  hunkHeaderKeyOf,
  noteKeyOf,
  sameAnchor,
} from './anchor'
import type { Block } from './layout'
import { rowsOf, sliceHunk } from './layout'
import { composeRowsOf, noteLinesOf } from './note-layout'

export const TITLE_KEY = 'title'
export const STATUS_KEY = 'status'
export const OUTDATED_TITLE_KEY = 'outdated-title'
export const ORPHANS_TITLE_KEY = 'orphans-title'
/** The block key of an orphaned path's own heading row, inside the `orphans#` group. */
export const orphanPathKeyOf = (path: string) => `orphan-path:${path}`

const EMPTY_GONE: ReadonlySet<string> = new Set()

/**
 * Whether `comment` is this file's own: a diff comment (never a doc comment — `section` is the
 * one discriminator, checked explicitly rather than leaned on paths staying distinct between the
 * two panes) whose path matches `file`'s current path or, a rename, its old one. The Files tree
 * opens a markdown file in the Doc pane by the same git-relative path this `file.path` already is,
 * so a doc-section comment made there can otherwise collide with this file's own path exactly.
 */
const belongsTo = (comment: Comment, file: ChangedFile): boolean =>
  comment.section === undefined && (comment.path === file.path || comment.path === file.oldPath)

/** The header's fixed row count (counts+source, then the action buttons) and the rule below it. */
const HEADER_ROWS = 2
const RULE_ROWS = 1

/** The fixed rows above the scrolling body: the header, the (capped) file list, and the rule. */
export function fixedRowsOf(fileCount: number, maxListRows: number): number {
  return HEADER_ROWS + Math.min(fileCount, maxListRows) + RULE_ROWS
}

/** The 2-column left rail (`▌ `) every row of a file's section draws behind. */
const RAIL_CELLS = 2
/** The one-cell indent a note and a hunk toolbar draw after the rail. */
const NOTE_INDENT = 1

/** A row's room beside the file rail, for a pane `columns` wide. */
export const contentWidthOf = (columns: number): number => Math.max(1, columns - RAIL_CELLS)

/** A note card's (or hunk toolbar's) room: the content width less the indent after the rail. */
export const indentedWidthOf = (contentWidth: number): number =>
  Math.max(1, contentWidth - NOTE_INDENT)

/** The fixed rows' payload: one variant per row kind a `Block` can carry. */
export type BodyItem =
  | { kind: 'title'; file: ChangedFile; canNote: boolean }
  | { kind: 'note'; comment: Comment; lines: string[] }
  | { kind: 'addressed'; anchor: Anchor; count: number }
  | { kind: 'outdated-title' }
  | { kind: 'comment-box'; anchor: Anchor; hunk?: Hunk; hasPicker: boolean }
  | { kind: 'hunk-header'; anchor: Anchor; hunk: Hunk; canNote: boolean; isReadOnly: boolean }
  | { kind: 'gap' }
  | { kind: 'status'; text: string }
  | { kind: 'orphans-title' }
  | { kind: 'orphan-path'; path: string; isGone: boolean }

type InlineNotes = { at: number; notes: Comment[] }

/**
 * A hunk's visible notes that carry a locatable `line`, grouped by the body row they sit under
 * (ascending), and the rest (hunk-wide notes, addressed ones, lines no longer found) which stay
 * after the hunk.
 */
function splitInline(hunk: Hunk, notes: Comments): { inline: InlineNotes[]; rest: Comments } {
  const { visible } = splitAddressed(notes)
  const rows = lineRowsOf(hunk)
  const byRow = new Map<number, Comment[]>()
  const placed = new Set<Comment>()
  for (const comment of visible) {
    const at = comment.line ? rows.get(lineKeyOf(comment.line)) : undefined
    if (at === undefined) continue
    placed.add(comment)
    byRow.set(at, [...(byRow.get(at) ?? []), comment])
  }
  const inline = [...byRow.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([at, list]) => ({ at, notes: list }))
  return { inline, rest: notes.filter(comment => !placed.has(comment)) }
}

/**
 * A hunk as blocks: whole when nothing sits under one of its lines, else a segment per commented
 * line — the lines up to and including it (its rail cell marked with the first note's status),
 * then that line's cards — and a last segment for the rest. Row-exact: the segments' lines and
 * the cards' rows add up to the hunk plus the notes.
 */
function hunkSegmentsOf(
  index: number,
  hunk: Hunk,
  inline: readonly InlineNotes[],
  width: number,
): Block<BodyItem>[] {
  const key = hunkKeyOf(index, hunk)
  if (inline.length === 0) return [{ kind: 'hunk', key, hunk }]

  // Each segment is a plain hunk block over a pre-sliced hunk (gutter renumbered by `sliceHunk`).
  const segmentOf = (from: number, to: number, mark?: CommentStatus): Block<BodyItem> => ({
    kind: 'hunk',
    key: from === 0 ? key : `${key}~${from}`,
    hunk: sliceHunk(hunk, from, to),
    mark,
  })
  const total = bodyLinesOf(hunk).length
  const blocks: Block<BodyItem>[] = []
  let from = 0
  for (const { at, notes } of inline) {
    blocks.push(segmentOf(from, at + 1, notes[0]?.status))
    blocks.push(...notesBlocksOf(notes, { path: notes[0]?.path ?? '' }, width))
    from = at + 1
  }
  if (from < total) blocks.push(segmentOf(from, total))
  return blocks
}

/** The block key of hunk `index`, unique even across hunks sharing a header (e.g. after a slice). */
export const hunkKeyOf = (index: number, hunk: Hunk) => `hunk:${index}:${hunk.header}`

/** An anchor's notes: addressed ones collapsed to a single "N addressed" row, then each visible one. */
function notesBlocksOf(notes: Comments, anchor: Anchor, width: number): Block<BodyItem>[] {
  const { addressed, visible } = splitAddressed(notes)

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
    ...visible.map((comment): Block<BodyItem> => {
      const lines = noteLinesOf(comment, width)
      return {
        kind: 'fixed',
        key: noteKeyOf(comment.id),
        rows: lines.length,
        item: { kind: 'note', comment, lines },
      }
    }),
  )
  return blocks
}

/**
 * One anchor's notes followed by its comment box, drawn only while that anchor is being composed
 * — idle, the "＋ note" control lives on the heading or the hunk's actions row instead, so no
 * block is emitted at all. A surface without `canType` drops the box entirely (no controls to
 * draw); `hasPicker` — whether the box draws its line-picker row — is carried on the block itself
 * so the row count here and `commentBox`'s own drawing never disagree.
 */
function anchorBlocksOf(
  notes: Comments,
  anchor: Anchor,
  composing: Anchor | null,
  capabilities: Capabilities,
  width: number,
  hunk?: Hunk,
): Block<BodyItem>[] {
  const notesBlocks = notesBlocksOf(notes, anchor, width)
  if (!capabilities.canType || !sameAnchor(composing, anchor)) return notesBlocks

  const hasPicker = hunk !== undefined && capabilities.canPick
  const rows = composeRowsOf(hasPicker)
  return [
    ...notesBlocks,
    {
      kind: 'fixed',
      key: commentBoxKeyOf(anchor),
      rows,
      item: { kind: 'comment-box', anchor, hunk, hasPicker },
    },
  ]
}

/** The outdated group: a dim title row, then each stale anchor's notes (no comment box). */
function outdatedBlocksOf(outdated: Comments, width: number): Block<BodyItem>[] {
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
    blocks.push(...notesBlocksOf(group, { path: group[0]?.path ?? '', hunk }, width))
  }
  return blocks
}

/**
 * The trailing group for comments (any status) whose path matches no file in the current stream
 * — the diff source moved past it, or it is simply gone: a dim "Not in this diff" heading, then
 * each such path's own row (its own `${path}#` prefixed later, in `streamOf`) carrying a dim
 * "file gone" when `gonePaths` names it, and that path's notes beneath it (same
 * addressed-collapse as `outdatedBlocksOf`, via `notesBlocksOf`). A path `gonePaths` doesn't
 * name — never checked, or the check failed — never draws "file gone": fail open. Empty
 * `orphans` emits nothing, so the group is absent entirely rather than a bare heading.
 */
function orphanBlocksOf(
  orphans: Comments,
  gonePaths: ReadonlySet<string>,
  width: number,
): Block<BodyItem>[] {
  if (orphans.length === 0) return []

  const byPath = new Map<string, Comment[]>()
  for (const comment of orphans) {
    const group = byPath.get(comment.path)
    if (group) group.push(comment)
    else byPath.set(comment.path, [comment])
  }

  const blocks: Block<BodyItem>[] = [
    { kind: 'fixed', key: ORPHANS_TITLE_KEY, rows: 1, item: { kind: 'orphans-title' } },
  ]
  for (const [path, group] of byPath) {
    blocks.push({
      kind: 'fixed',
      key: orphanPathKeyOf(path),
      rows: 1,
      item: { kind: 'orphan-path', path, isGone: gonePaths.has(path) },
    })
    blocks.push(...notesBlocksOf(group, { path }, width))
  }
  return blocks
}

export type BlocksOptions = {
  /** A turn's diff is read-only: no comment boxes, no stage/revert, just the title and hunks. */
  readOnly?: boolean
  /** The surface's capabilities (`canType`, `canPick`, `canShowImage`); every one is on when omitted. */
  capabilities?: Capabilities
  /**
   * The content width (`contentWidthOf`) a note wraps to; its block's `rows` is its wrapped line
   * count at this width.
   */
  width: number
  /** The status for a file whose hunks are undefined; `Loading…` when omitted. */
  unreadText?: string
}

/**
 * The selected file's body as fixed-height and hunk blocks, top to bottom: the title row (carrying
 * the file's own note chip), the file-level notes and comment box, then each hunk preceded by its
 * toolbar row (its header label and, unless read-only, the note/stage/revert chips) and followed
 * by its own notes and comment box (no row after a hunk), then an "Outdated" group for comments
 * whose hunk no longer exists. A file with no hunks (loading, binary, or no textual changes) ends
 * with one status row instead.
 */
export function blocksOf(
  file: ChangedFile,
  hunks: readonly Hunk[] | undefined,
  comments: Comments,
  composing: Anchor | null,
  options: BlocksOptions,
): Block<BodyItem>[] {
  const isReadOnly = options.readOnly ?? false
  const capabilities = options.capabilities ?? FULL_CAPABILITIES
  const width = indentedWidthOf(options.width)
  const fileAnchor: Anchor = { path: file.path }
  const own = comments.filter(comment => belongsTo(comment, file))
  const grouped = groupByAnchor(own, hunks?.map(hunk => hunk.header) ?? [])
  const canNoteFile = !isReadOnly && capabilities.canType && !sameAnchor(composing, fileAnchor)

  const blocks: Block<BodyItem>[] = [
    {
      kind: 'fixed',
      key: TITLE_KEY,
      rows: 1,
      item: { kind: 'title', file, canNote: canNoteFile },
    },
    ...(isReadOnly ? [] : anchorBlocksOf(grouped.file, fileAnchor, composing, capabilities, width)),
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
    const anchor: Anchor = { path: file.path, hunk: hunk.header }
    blocks.push({
      kind: 'fixed',
      key: hunkHeaderKeyOf(anchor),
      rows: 1,
      item: {
        kind: 'hunk-header',
        anchor,
        hunk,
        canNote: !isReadOnly && capabilities.canType && !sameAnchor(composing, anchor),
        isReadOnly,
      },
    })
    if (isReadOnly) {
      blocks.push({ kind: 'hunk', key: hunkKeyOf(index, hunk), hunk })
      return
    }
    const { inline, rest } = splitInline(hunk, grouped.byHunk.get(hunk.header) ?? [])
    blocks.push(...hunkSegmentsOf(index, hunk, inline, width))
    blocks.push(...anchorBlocksOf(rest, anchor, composing, capabilities, width, hunk))
  })

  if (!isReadOnly) blocks.push(...outdatedBlocksOf(grouped.outdated, width))

  return blocks
}

/** Every file's blocks in one scroll, with each file's title row for the list to jump to. */
export type Stream = {
  blocks: Block<BodyItem>[]
  titleRows: ReadonlyMap<string, number>
  contentRows: number
}

/**
 * The files' `blocksOf` one after another, a blank gap row between files; each block's key is
 * prefixed with its file's path so keys stay unique across the stream.
 */
export function streamOf(
  files: readonly ChangedFile[],
  hunksFor: (file: ChangedFile) => readonly Hunk[] | undefined,
  comments: Comments,
  composing: Anchor | null,
  options: BlocksOptions,
  /** Which comment paths are confirmed gone, for the trailing orphans group's "file gone" label. */
  gonePaths: ReadonlySet<string> = EMPTY_GONE,
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

  // Doc comments (carry `section`) never belong to the diff stream at all; a file-anchored one
  // belongs here when its path matches a current file's path or (a rename) oldPath.
  const isOwned = (comment: Comment) => files.some(file => belongsTo(comment, file))
  const orphans = comments.filter(comment => comment.section === undefined && !isOwned(comment))
  for (const block of orphanBlocksOf(orphans, gonePaths, indentedWidthOf(options.width))) {
    blocks.push({ ...block, key: `orphans#${block.key}` })
    row += rowsOf(block)
  }

  return { blocks, titleRows, contentRows: row }
}

/** The file whose section holds `row`: the last title at or above it; null for an empty stream. */
export function fileAtRow(titleRows: ReadonlyMap<string, number>, row: number): string | null {
  let found: string | null = null
  for (const [path, start] of titleRows) if (start <= row) found = path
  return found
}

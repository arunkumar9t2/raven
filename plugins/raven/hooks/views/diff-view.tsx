/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Host } from '../core/host'
import type { Kit, View } from '../core/view'
import { branchPointOf } from '../git/base'
import type { ChangedFile } from '../git/changes'
import type { Hunk } from '../git/hunks'
import { applyPatch, type Base, loadChanges, loadHunks } from '../git/load'
import { patchOf } from '../git/patch'
import { DIFF_PANE, sourceStoreKeyOf } from '../names'
import type { CommentLine, Comments } from '../review/comments'
import type { Review } from '../review/review'
import { changedFileOfTurnFile, type TurnEdits, turnEditsOf, turnFilesOf } from '../review/turns'
import { type Anchor, anchorKeyOf, commentButtonKeyOf, inputKeyOf } from './diff/anchor'
import { type BodyItem, blocksOf, type HunkState } from './diff/blocks'
import { addressedRow, commentBox, hunkActionsRow, note, outdatedTitle } from './diff/comment-box'
import { fileList, MAX_ROWS } from './diff/file-list'
import { header } from './diff/header'
import {
  type Block,
  clampTop,
  contentRowsOf,
  type Placed,
  sliceHunk,
  stepFileIndexOf,
  windowOf,
} from './diff/layout'
import { isPersistable, type Source, sourceOf, sourceOptionsOf, sourceValueOf } from './diff/source'

const HEADER_ROWS = 1
const RULE_ROWS = 1
// A wheel tick reports a row or two; the terminal's own scrollable views move a few rows per tick.
const WHEEL_ROWS = 3
const EMPTY_STAGED: ReadonlySet<string> = new Set()

type Model = {
  repository: { toplevel: string; files: readonly ChangedFile[] } | null
  isLoaded: boolean
  selected: string | null
  hunks: ReadonlyMap<string, readonly Hunk[]>
  composing: Anchor | null
  /** The line picked in the composing anchor's Select; null is "whole hunk". */
  composingLine: CommentLine | null
  top: number
  /** Whether the "clear" button is waiting for a confirming second press. */
  confirmingClear: boolean
  /** Staged hunk headers per file path, cleared for a path when its hunks no longer carry them. */
  stagedHunks: ReadonlyMap<string, ReadonlySet<string>>
  /** The anchor key of the hunk whose "revert" is waiting for a confirming second press. */
  confirmingRevert: string | null
  /** What the diff is shown against; persisted per repository except a turn, which never is. */
  source: Source
  /** HEAD's sha at this module instance's first successful load; null until captured. */
  sessionStartSha: string | null
  /** HEAD's merge-base with the default branch, refreshed alongside the repository; null when unresolvable. */
  branchPointSha: string | null
  /** Each turn with edits, recomputed on every refresh; oldest first, as `turnEditsOf` returns them. */
  turns: readonly TurnEdits[]
}

/** What the diff view asks of the controller. */
export type DiffActions = {
  /** Submits the pending review to Claude. */
  send: () => void
  /** Fills the prompt with the pending review so the person can edit it before sending. */
  editAndSend: () => void
  /** Gives the keyboard to the element drawn under `key`. */
  focus: (key: string) => void
}

export type DiffView = View & {
  refresh: () => Promise<void>
  /** Selects the file at an absolute path, when it is among the changes. */
  reveal: (path: string) => void
}

/** The fixed rows above the scrolling body: the header, the (capped) file list, and the rule. */
function fixedRowsOf(fileCount: number): number {
  return HEADER_ROWS + Math.min(fileCount, MAX_ROWS) + RULE_ROWS
}

export function createDiffView(host: Host, review: Review, actions: DiffActions): DiffView {
  let model: Model = {
    repository: null,
    isLoaded: false,
    selected: null,
    hunks: new Map(),
    composing: null,
    composingLine: null,
    top: 0,
    confirmingClear: false,
    stagedHunks: new Map(),
    confirmingRevert: null,
    source: { kind: 'head' },
    sessionStartSha: null,
    branchPointSha: null,
    turns: [],
  }

  // The body rows the most recent render computed, so `scroll` can clamp without recomputing it.
  let lastBodyRows = 0

  // The last blocksOf() result, valid while its inputs are reference-equal to these.
  let cache: {
    file: ChangedFile
    hunks: readonly Hunk[] | undefined
    comments: Comments
    composing: Anchor | null
    staged: ReadonlySet<string>
    confirmingRevert: string | null
    turnIndex: number | undefined
    blocks: Block<BodyItem>[]
    contentRows: number
  } | null = null

  // Read once, at the first refresh; a store lookup needs the repository's toplevel, so a plain
  // `git rev-parse --show-toplevel` runs ahead of `loadChanges` rather than duplicating its work.
  let hasReadStoredSource = false

  /** The base the current source names, falling back to HEAD while its sha is not yet known. */
  function currentBase(): Base {
    if (model.source.kind === 'session' && model.sessionStartSha !== null) {
      return { kind: 'commit', sha: model.sessionStartSha }
    }
    if (model.source.kind === 'branch-point' && model.branchPointSha !== null) {
      return { kind: 'commit', sha: model.branchPointSha }
    }
    return { kind: 'head' }
  }

  function turnHunksFrom(turns: readonly TurnEdits[], index: number): Map<string, readonly Hunk[]> {
    return new Map(turnFilesOf(turns, index).map(file => [file.path, file.hunks]))
  }

  /** The files the current source shows: the repository's, or one turn's edited files. */
  function filesOf(): readonly ChangedFile[] {
    return model.source.kind === 'turn'
      ? turnFilesOf(model.turns, model.source.index).map(changedFileOfTurnFile)
      : (model.repository?.files ?? [])
  }

  async function resolveStoredSource(): Promise<void> {
    if (hasReadStoredSource) return
    hasReadStoredSource = true
    const top = await host.run(['git', 'rev-parse', '--show-toplevel']).catch(() => null)
    if (top?.exitCode !== 0) return
    const stored = await host.storeGet(sourceStoreKeyOf(top.stdout.trim()))
    if (typeof stored !== 'string') return
    const source = sourceOf(stored)
    if (isPersistable(source)) model = { ...model, source }
  }

  // Any action but a second "clear"/"revert" press drops those confirm states, so `patch`
  // overrides them only when the caller means to set one.
  const update = (patch: Partial<Model>) => {
    model = { ...model, confirmingClear: false, confirmingRevert: null, ...patch }
    host.redraw()
  }

  const selectedFile = () => filesOf().find(file => file.path === model.selected) ?? null

  // Bumped by each refresh, so a slow read that lands after a newer one is dropped.
  let generation = 0

  /** Drops staged marks for headers that no longer appear in `file`'s current hunks. */
  function prunedStaged(
    path: string,
    hunks: readonly Hunk[],
  ): ReadonlyMap<string, ReadonlySet<string>> {
    const staged = model.stagedHunks.get(path)
    if (!staged || staged.size === 0) return model.stagedHunks
    const headers = new Set(hunks.map(hunk => hunk.header))
    const kept = new Set([...staged].filter(header => headers.has(header)))
    return kept.size === staged.size
      ? model.stagedHunks
      : new Map(model.stagedHunks).set(path, kept)
  }

  /** No-op for a turn source: its hunks are already known, set whole when the source is chosen. */
  async function loadSelected() {
    if (model.source.kind === 'turn') return
    const file = selectedFile()
    if (!file) return
    const started = generation
    const hunks = await loadHunks(host.run, file, currentBase()).catch((): Hunk[] => [])
    const isCurrent = started === generation && model.selected === file.path
    if (isCurrent) {
      update({
        hunks: new Map(model.hunks).set(file.path, hunks),
        stagedHunks: prunedStaged(file.path, hunks),
      })
    }
  }

  async function refresh() {
    await resolveStoredSource()
    const started = ++generation
    const [repository, branchPointSha, messages] = await Promise.all([
      loadChanges(host.run, currentBase()).catch(() => null),
      branchPointOf(host.run).catch(() => null),
      host.messages().catch(() => []),
    ])
    if (started !== generation) return

    if (repository && model.sessionStartSha === null) {
      const head = await host.run(['git', 'rev-parse', 'HEAD']).catch(() => null)
      if (started === generation && head && head.exitCode === 0) {
        model = { ...model, sessionStartSha: head.stdout.trim() }
      }
    }

    const turns = turnEditsOf(messages)
    const source = model.source
    const files =
      source.kind === 'turn'
        ? turnFilesOf(turns, source.index).map(changedFileOfTurnFile)
        : (repository?.files ?? [])
    const isKept = files.some(file => file.path === model.selected)

    update({
      repository,
      branchPointSha,
      turns,
      isLoaded: true,
      hunks: source.kind === 'turn' ? turnHunksFrom(turns, source.index) : new Map(),
      selected: isKept ? model.selected : (files[0]?.path ?? null),
    })

    if (repository) await review.load(repository.toplevel)
    if (source.kind !== 'turn') await loadSelected()
  }

  function select(path: string) {
    if (path === model.selected) return
    update({ selected: path, composing: null, top: 0 })
    void loadSelected()
  }

  /** Moves the selection `by` files (1 next, -1 previous); the `j`/`k` hotkeys and ↓/↑ buttons. */
  function stepSelection(by: number) {
    const files = filesOf()
    if (files.length === 0) return
    const from = files.findIndex(file => file.path === model.selected)
    const file = files[stepFileIndexOf(files.length, from, by)]
    if (file) select(file.path)
  }

  /** Switches the source; a turn's files/hunks are set at once, a git base triggers a reload. */
  function selectSource(value: string) {
    const source = sourceOf(value)
    const toplevel = model.repository?.toplevel
    if (isPersistable(source) && toplevel) void host.storeSet(sourceStoreKeyOf(toplevel), value)

    model = {
      ...model,
      source,
      top: 0,
      composing: null,
      confirmingClear: false,
      confirmingRevert: null,
    }

    if (source.kind === 'turn') {
      const files = turnFilesOf(model.turns, source.index).map(changedFileOfTurnFile)
      update({ hunks: turnHunksFrom(model.turns, source.index), selected: files[0]?.path ?? null })
      return
    }

    void refresh()
  }

  function startComposing(anchor: Anchor) {
    update({ composing: anchor, composingLine: null })
    actions.focus(inputKeyOf(anchor))
  }

  /** Closes the compose box and hands the keyboard back to its anchor's comment button. */
  function stopComposing(anchor: Anchor) {
    update({ composing: null, composingLine: null })
    actions.focus(commentButtonKeyOf(anchor))
  }

  function submitComment(anchor: Anchor, text: string) {
    if (text.trim() !== '') {
      const line = model.composingLine
      review.add(line ? { ...anchor, line, text: text.trim() } : { ...anchor, text: text.trim() })
    }
    stopComposing(anchor)
  }

  function pressClear() {
    if (model.confirmingClear) {
      update({ confirmingClear: false })
      review.clear()
    } else {
      update({ confirmingClear: true })
    }
  }

  /** Runs `git apply` for one hunk's patch; marks it staged on success, reloads hunks either way. */
  async function applyHunk(file: ChangedFile, hunk: Hunk, mode: 'stage' | 'revert') {
    const result = await applyPatch(host.run, patchOf(file, hunk), mode)
    if (!result.ok) {
      host.toast(
        `Raven: git ${mode === 'stage' ? 'apply --cached' : 'apply -R'} failed: ${result.error ?? 'unknown error'}`,
      )
      return
    }
    if (mode === 'stage') {
      const current = model.stagedHunks.get(file.path) ?? new Set<string>()
      update({
        stagedHunks: new Map(model.stagedHunks).set(file.path, new Set(current).add(hunk.header)),
      })
    }
    await loadSelected()
  }

  function pressStage(file: ChangedFile, hunk: Hunk) {
    void applyHunk(file, hunk, 'stage')
  }

  /** First press asks for confirmation; a second press on the same hunk reverts it. */
  function pressRevert(file: ChangedFile, hunk: Hunk, anchor: Anchor) {
    const key = anchorKeyOf(anchor)
    if (model.confirmingRevert === key) {
      update({})
      void applyHunk(file, hunk, 'revert')
    } else {
      update({ confirmingRevert: key })
    }
  }

  /** The selected file's blocks and their total row count, cached while its inputs are unchanged. */
  function blocksForSelected(): {
    file: ChangedFile | null
    blocks: Block<BodyItem>[]
    contentRows: number
  } {
    const file = selectedFile()
    if (!file) {
      cache = null
      return { file: null, blocks: [], contentRows: 0 }
    }

    const hunks = model.hunks.get(file.path)
    const comments = review.comments()
    const staged = model.stagedHunks.get(file.path) ?? EMPTY_STAGED
    const turnIndex = model.source.kind === 'turn' ? model.source.index : undefined

    if (
      cache &&
      cache.file === file &&
      cache.hunks === hunks &&
      cache.comments === comments &&
      cache.composing === model.composing &&
      cache.staged === staged &&
      cache.confirmingRevert === model.confirmingRevert &&
      cache.turnIndex === turnIndex
    ) {
      return { file, blocks: cache.blocks, contentRows: cache.contentRows }
    }

    const hunkState: HunkState = { staged, confirmingRevert: model.confirmingRevert }
    const blocks = blocksOf(file, hunks, comments, model.composing, { hunkState, turnIndex })
    const contentRows = contentRowsOf(blocks)
    cache = {
      file,
      hunks,
      comments,
      composing: model.composing,
      staged,
      confirmingRevert: model.confirmingRevert,
      turnIndex,
      blocks,
      contentRows,
    }
    return { file, blocks, contentRows }
  }

  /** One fixed row's element, by its payload kind; `null` renders as a blank row (e.g. a gap). */
  function bodyRowOf(kit: Kit, item: BodyItem): RenderElement | null {
    const { Text } = kit.ui
    switch (item.kind) {
      case 'title':
        return (
          <Text bold>
            {item.turnIndex !== undefined ? `Turn ${item.turnIndex}` : item.file.path}
          </Text>
        )
      case 'status':
        return <Text dimColor>{item.text}</Text>
      case 'gap':
        return null
      case 'outdated-title':
        return outdatedTitle(kit)
      case 'addressed':
        return addressedRow(kit, item.anchor, item.count)
      case 'note':
        return note(kit, item.comment, id => review.remove(id), review.resend)
      case 'comment-box':
        return commentBox(kit, {
          anchor: item.anchor,
          composing: model.composing,
          inputKey: inputKeyOf(item.anchor),
          hunk: item.hunk,
          line: model.composingLine,
          columns: kit.columns,
          hotkey: item.anchor.hunk === undefined ? 'c' : undefined,
          onStart: startComposing,
          onLineChange: line => update({ composingLine: line }),
          onSubmit: text => submitComment(item.anchor, text),
          onCancel: () => stopComposing(item.anchor),
        })
      case 'hunk-actions': {
        const file = selectedFile()
        return hunkActionsRow(kit, {
          anchor: item.anchor,
          isStaged: item.isStaged,
          confirmingRevert: item.confirmingRevert,
          onStage: () => file && pressStage(file, item.hunk),
          onRevert: () => file && pressRevert(file, item.hunk, item.anchor),
        })
      }
    }
  }

  function placedRowOf(kit: Kit, placed: Placed<BodyItem>, file: ChangedFile): RenderElement {
    const { Box, Code } = kit.ui
    const { block } = placed

    if (block.kind === 'hunk') {
      return (
        <Code
          key={block.key}
          source={sliceHunk(block.hunk, placed.from, placed.to).text}
          format="diff"
          path={file.path}
          wrap="truncate-end"
        />
      )
    }

    return <Box key={block.key}>{bodyRowOf(kit, block.item)}</Box>
  }

  function render(kit: Kit): RenderElement {
    const { Box, Text } = kit.ui
    const { repository, source } = model

    if (!model.isLoaded) return <Text dimColor>Reading the repository…</Text>
    if (source.kind !== 'turn' && !repository) return <Text dimColor>Not in a git repository.</Text>

    const files = filesOf()
    if (files.length === 0) {
      const text = source.kind === 'turn' ? 'This turn edited no files.' : 'No uncommitted changes.'
      return <Text dimColor>{text}</Text>
    }

    const { file, blocks, contentRows } = blocksForSelected()

    const bodyRows = Math.max(0, kit.rows - fixedRowsOf(files.length))
    lastBodyRows = bodyRows
    const top = clampTop(model.top, contentRows, bodyRows)
    if (top !== model.top) model = { ...model, top }

    const placed = file ? windowOf(blocks, top, bodyRows) : []

    return (
      <Box flexDirection="column">
        {header(kit, {
          files,
          pending: review.pending().length,
          confirmingClear: model.confirmingClear,
          sourceValue: sourceValueOf(source),
          sourceOptions: sourceOptionsOf({
            hasBranchPoint: model.branchPointSha !== null,
            turns: model.turns,
          }),
          onSourceChange: selectSource,
          onRefresh: () => void refresh(),
          onSend: () => {
            update({})
            actions.send()
          },
          onEditSend: () => {
            update({})
            actions.editAndSend()
          },
          onPrevious: () => stepSelection(-1),
          onNext: () => stepSelection(1),
          onClear: pressClear,
        })}
        {fileList(kit, { files, selected: model.selected, onSelect: select })}
        <Text dimColor>{'─'.repeat(Math.max(1, kit.columns - 1))}</Text>
        {placed.map(p => placedRowOf(kit, p, file as ChangedFile))}
      </Box>
    )
  }

  function scroll(by: number): boolean {
    const { file, contentRows } = blocksForSelected()
    if (!file) return false
    const bodyRows = lastBodyRows
    const size = Math.abs(by)
    // A wheel tick or arrow asks for a row or two; scale it to a readable step, as the terminal's
    // own scrollable views do. A page or Home/End key already asks for a step this size or more.
    const step = size >= bodyRows ? size : size * WHEEL_ROWS
    const top = clampTop(model.top + Math.sign(by) * step, contentRows, bodyRows)
    if (top !== model.top) update({ top })
    return true
  }

  function reveal(path: string) {
    const toplevel = model.repository?.toplevel
    if (toplevel && path.startsWith(`${toplevel}/`)) select(path.slice(toplevel.length + 1))
  }

  return { pane: DIFF_PANE, subcommand: 'diff', render, refresh, reveal, scroll }
}

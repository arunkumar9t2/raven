/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { type Host, loggedAs } from '../core/host'
import { type Capabilities, capabilitiesOf, type Kit, type View } from '../core/view'
import type { ChangedFile } from '../git/changes'
import type { Hunk } from '../git/hunks'
import { applyPatch, loadChanges, loadHunks, refOf } from '../git/load'
import { patchOf } from '../git/patch'
import { DIFF_PANE } from '../names'
import type { CommentLine, Comments } from '../review/comments'
import type { Review } from '../review/review'
import { type Anchor, anchorKeyOf, commentButtonKeyOf, inputKeyOf } from './diff/anchor'
import { type BodyItem, blocksOf, fixedRowsOf } from './diff/blocks'
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
import { selectedHunksOf, sourceValueOf } from './diff/source'
import { createSourceController } from './diff/source-controller'

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
  /** Staged hunk headers per file path, cleared for a path when its hunks no longer carry them. */
  stagedHunks: ReadonlyMap<string, ReadonlySet<string>>
  /**
   * The key of the control waiting for a confirming second press: `'clear'`, or a hunk's revert
   * anchor key. Any other update drops it (see `update`).
   */
  confirming: string | null
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

export function createDiffView(host: Host, review: Review, actions: DiffActions): DiffView {
  let model: Model = {
    repository: null,
    isLoaded: false,
    selected: null,
    hunks: new Map(),
    composing: null,
    composingLine: null,
    top: 0,
    stagedHunks: new Map(),
    confirming: null,
  }

  const sourceController = createSourceController(host)

  // The body rows, selected file and content-row count the most recent render computed, so
  // `scroll` (which has no kit) can clamp without recomputing them.
  let lastBodyRows = 0
  let lastFile: ChangedFile | null = null
  let lastContentRows = 0

  // The last blocksOf() result, valid while its inputs are reference-equal to these.
  let cache: {
    file: ChangedFile
    hunks: readonly Hunk[] | undefined
    comments: Comments
    composing: Anchor | null
    turnIndex: number | undefined
    readOnly: boolean
    capabilities: Capabilities
    blocks: Block<BodyItem>[]
    contentRows: number
  } | null = null

  /** The files the current source shows: the repository's, or one turn's edited files. */
  function filesOf(): readonly ChangedFile[] {
    return sourceController.files(model.repository)
  }

  // Any action but a second "clear"/"revert" press drops the armed confirm, so `patch` overrides
  // it only when the caller means to set one.
  const update = (patch: Partial<Model>) => {
    model = { ...model, confirming: null, ...patch }
    host.redraw()
  }

  /** Drops the armed confirm without any other change; the intent-bearing name for a bare `update({})`. */
  const resetConfirm = () => update({})

  const isArmed = (key: string) => model.confirming === key
  const arm = (key: string) => update({ confirming: key })

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

  /** No-op for a turn source: its hunks are already known, read straight off the controller. */
  async function loadSelected() {
    if (sourceController.isReadOnly()) return
    const file = selectedFile()
    if (!file) return
    const started = generation
    const hunks = await loadHunks(host.run, file, sourceController.base()).catch(
      loggedAs<Hunk[]>(host, 'loading hunks', []),
    )
    const isCurrent = started === generation && model.selected === file.path
    if (isCurrent) {
      update({
        hunks: new Map(model.hunks).set(file.path, hunks),
        stagedHunks: prunedStaged(file.path, hunks),
      })
    }
  }

  async function refresh() {
    await sourceController.resolveStoredSource()
    const started = ++generation
    const read = () =>
      loadChanges(host.run, sourceController.base()).catch(loggedAs(host, 'loading changes', null))
    const baseRead = refOf(sourceController.base())
    let repository = await read()
    if (started !== generation) return

    await sourceController.refresh(repository)
    // Resolving the sources can move the base (the branch point is known only now): read again.
    if (refOf(sourceController.base()) !== baseRead) repository = await read()
    if (started !== generation) return

    const files = sourceController.files(repository)
    const isKept = files.some(file => file.path === model.selected)

    update({
      repository,
      isLoaded: true,
      hunks: new Map(),
      selected: isKept ? model.selected : (files[0]?.path ?? null),
    })

    if (repository) await review.load(repository.toplevel)
    if (!sourceController.isReadOnly()) await loadSelected()
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

  /** Switches the source; a turn's files are already known, a git base triggers a reload. */
  function selectSource(value: string) {
    sourceController.select(value)
    update({ top: 0, composing: null })

    if (sourceController.isReadOnly()) {
      const files = filesOf()
      update({ selected: files[0]?.path ?? null })
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
    if (isArmed('clear')) {
      resetConfirm()
      review.clear()
    } else {
      arm('clear')
    }
  }

  /**
   * Runs `git apply` for one hunk's patch; marks it staged on success, reloads hunks either way.
   * Re-reads the file's current hunks first: `hunk` was captured at the last render, and the
   * working tree may have moved under it since (an edit, a stage/revert from elsewhere). Applying
   * a patch built from a header that no longer matches the file risks silently touching the wrong
   * lines, so an exact header+text match is required before `git apply` ever runs.
   */
  async function applyHunk(file: ChangedFile, hunk: Hunk, mode: 'stage' | 'revert') {
    const current = await loadHunks(host.run, file, sourceController.base()).catch(
      loggedAs<Hunk[]>(host, 'loading hunks', []),
    )
    const stillPresent = current.some(
      candidate => candidate.header === hunk.header && candidate.text === hunk.text,
    )
    if (!stillPresent) {
      host.toast('The hunk changed — refreshed, try again')
      update({
        hunks: new Map(model.hunks).set(file.path, current),
        stagedHunks: prunedStaged(file.path, current),
      })
      return
    }
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

  /** First press asks for confirmation; a second press on the same hunk reverts it. */
  function pressRevert(file: ChangedFile, hunk: Hunk, anchor: Anchor) {
    const key = anchorKeyOf(anchor)
    if (isArmed(key)) {
      resetConfirm()
      void applyHunk(file, hunk, 'revert')
    } else {
      arm(key)
    }
  }

  /** The selected file's blocks and their total row count, cached while its inputs are unchanged. */
  function blocksForSelected(capabilities: Capabilities): {
    file: ChangedFile | null
    blocks: Block<BodyItem>[]
    contentRows: number
  } {
    const file = selectedFile()
    if (!file) {
      cache = null
      return { file: null, blocks: [], contentRows: 0 }
    }

    const source = sourceController.source()
    const hunks = selectedHunksOf(
      source,
      sourceController.hunksFor(file),
      model.hunks.get(file.path),
    )
    const comments = review.comments()
    const turnIndex = source.kind === 'turn' ? source.index : undefined
    const readOnly = sourceController.isReadOnly()

    if (
      cache &&
      cache.file === file &&
      cache.hunks === hunks &&
      cache.comments === comments &&
      cache.composing === model.composing &&
      cache.turnIndex === turnIndex &&
      cache.readOnly === readOnly &&
      cache.capabilities.canType === capabilities.canType &&
      cache.capabilities.canPick === capabilities.canPick
    ) {
      return { file, blocks: cache.blocks, contentRows: cache.contentRows }
    }

    const blocks = blocksOf(file, hunks, comments, model.composing, {
      turnIndex,
      readOnly,
      capabilities,
    })
    const contentRows = contentRowsOf(blocks)
    cache = {
      file,
      hunks,
      comments,
      composing: model.composing,
      turnIndex,
      readOnly,
      capabilities,
      blocks,
      contentRows,
    }
    return { file, blocks, contentRows }
  }

  /** One fixed row's element, by its payload kind; `null` renders as a blank row (e.g. a gap). */
  function bodyRowOf(kit: Kit, item: BodyItem, file: ChangedFile): RenderElement | null {
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
      case 'hunk-actions':
        return hunkActionsRow(kit, {
          anchor: item.anchor,
          isStaged: (model.stagedHunks.get(file.path) ?? EMPTY_STAGED).has(item.hunk.header),
          confirmingRevert: isArmed(anchorKeyOf(item.anchor)),
          onStage: () => void applyHunk(file, item.hunk, 'stage'),
          onRevert: () => pressRevert(file, item.hunk, item.anchor),
        })
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

    return <Box key={block.key}>{bodyRowOf(kit, block.item, file)}</Box>
  }

  function render(kit: Kit): RenderElement {
    const { Box, Text } = kit.ui
    const { repository } = model
    const isReadOnly = sourceController.isReadOnly()

    if (!model.isLoaded) return <Text dimColor>Reading the repository…</Text>
    if (!isReadOnly && !repository) return <Text dimColor>Not in a git repository.</Text>

    const files = filesOf()
    if (files.length === 0) {
      const text = isReadOnly ? 'This turn edited no files.' : 'No uncommitted changes.'
      return <Text dimColor>{text}</Text>
    }

    const { file, blocks, contentRows } = blocksForSelected(capabilitiesOf(kit.ui))
    lastFile = file
    lastContentRows = contentRows

    const bodyRows = Math.max(0, kit.rows - fixedRowsOf(files.length, MAX_ROWS))
    lastBodyRows = bodyRows
    const top = clampTop(model.top, contentRows, bodyRows)
    if (top !== model.top) model = { ...model, top }

    const placed = file ? windowOf(blocks, top, bodyRows) : []

    return (
      <Box flexDirection="column">
        {header(kit, {
          files,
          pending: review.pending().length,
          confirmingClear: isArmed('clear'),
          sourceValue: sourceValueOf(sourceController.source()),
          sourceOptions: sourceController.options(),
          onSourceChange: selectSource,
          onRefresh: () => void refresh(),
          onSend: () => {
            resetConfirm()
            actions.send()
          },
          onEditSend: () => {
            resetConfirm()
            actions.editAndSend()
          },
          onPrevious: () => stepSelection(-1),
          onNext: () => stepSelection(1),
          onClear: pressClear,
        })}
        {fileList(kit, { files, selected: model.selected, onSelect: select })}
        <Text dimColor>{'─'.repeat(Math.max(1, kit.columns - 1))}</Text>
        {file ? placed.map(p => placedRowOf(kit, p, file)) : null}
      </Box>
    )
  }

  function scroll(by: number): boolean {
    if (!lastFile) return false
    const bodyRows = lastBodyRows
    const size = Math.abs(by)
    // A wheel tick or arrow asks for a row or two; scale it to a readable step, as the terminal's
    // own scrollable views do. A page or Home/End key already asks for a step this size or more.
    const step = size >= bodyRows ? size : size * WHEEL_ROWS
    const top = clampTop(model.top + Math.sign(by) * step, lastContentRows, bodyRows)
    if (top !== model.top) update({ top })
    return true
  }

  function reveal(path: string) {
    const toplevel = model.repository?.toplevel
    if (toplevel && path.startsWith(`${toplevel}/`)) select(path.slice(toplevel.length + 1))
  }

  return { pane: DIFF_PANE, subcommand: 'diff', render, refresh, reveal, scroll }
}

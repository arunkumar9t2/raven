/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../core/colors'
import { type Host, loggedAs } from '../core/host'
import type { Capabilities, Kit, View } from '../core/view'
import type { ChangedFile } from '../git/changes'
import type { Hunk } from '../git/hunks'
import { applyPatch, loadAllHunks, loadChanges, loadHunks, refOf } from '../git/load'
import { patchOf } from '../git/patch'
import { DIFF_PANE } from '../names'
import type { CommentLine, Comments } from '../review/comments'
import type { Review } from '../review/review'
import { type Anchor, anchorKeyOf, commentButtonKeyOf, inputKeyOf } from './diff/anchor'
import { type BodyItem, fileAtRow, fixedRowsOf, type Stream, streamOf } from './diff/blocks'
import {
  addressedRow,
  commentBox,
  hunkActionsRow,
  note,
  noteButton,
  outdatedTitle,
} from './diff/comment-box'
import { fileList, MAX_ROWS } from './diff/file-list'
import { header } from './diff/header'
import { clampTop, type Placed, sliceHunk, stepFileIndexOf, windowOf } from './diff/layout'
import { selectedHunksOf, sourceValueOf } from './diff/source'
import { createSourceController } from './diff/source-controller'
import { iconOf, statusMarkOf } from './icons'

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
  /**
   * A `reveal` target not yet among the last render's title rows (e.g. a file just edited, ahead
   * of the refresh that will add it); `render` jumps to it once `streamFor` places it.
   */
  pendingReveal: string | null
  /** Relative paths of files an edit touched this turn; cleared on `turnEnded`. */
  edited: ReadonlySet<string>
  /**
   * Absolute paths an edit touched before a refresh had yet loaded the repository (so no
   * toplevel was known to make them relative); a later refresh resolves and folds them into
   * `edited`, or drops them if they turn out to lie outside the repository.
   */
  pendingEdited: ReadonlySet<string>
  /**
   * The absolute path to reveal once the refresh it is waiting on completes and lands against a
   * freshly computed stream; null when idle. Left set (not dropped) while a compose box is open,
   * so the jump still happens once the box closes and a later refresh runs.
   */
  followPath: string | null
  /** False once the person scrolls the stream this turn; a further edit then leaves the view put. */
  isFollowing: boolean
}

const EMPTY_EDITED: ReadonlySet<string> = new Set()

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
  /** Marks `absolutePath` edited this turn; while following, the next refresh reveals it. */
  noteEdited: (absolutePath: string) => void
  /** Clears this turn's edited marks and resumes following, for the controller to call per turn. */
  turnEnded: () => void
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
    pendingReveal: null,
    edited: EMPTY_EDITED,
    pendingEdited: EMPTY_EDITED,
    followPath: null,
    isFollowing: true,
  }

  const sourceController = createSourceController(host)

  // The body rows and the title rows/content-row count of the most recent render computed, so
  // `scroll` and `select` (which have no kit) can clamp/jump without recomputing them.
  let lastBodyRows = 0
  let lastTitleRows: ReadonlyMap<string, number> = new Map()
  let lastContentRows = 0

  // The last streamOf() result, valid while its inputs are reference-equal to these.
  let cache: {
    files: readonly ChangedFile[]
    hunks: ReadonlyMap<string, readonly Hunk[]>
    comments: Comments
    composing: Anchor | null
    readOnly: boolean
    capabilities: Capabilities
    isLoaded: boolean
    stream: Stream
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

  const NO_HUNKS = { hunks: [] as Hunk[], isTruncated: false }

  /** A file's hunks against the current base; none (logged) when git fails. */
  const readHunks = (file: ChangedFile) =>
    loadHunks(host.run, file, sourceController.base()).catch(
      loggedAs(host, 'loading hunks', NO_HUNKS),
    )

  /** The model patch that seats `hunks` as `path`'s, keeping only staged marks still present. */
  const withHunks = (path: string, hunks: readonly Hunk[]) => ({
    hunks: new Map(model.hunks).set(path, hunks),
    stagedHunks: prunedStaged(path, hunks),
  })

  /**
   * `prunedStaged` over every path a bulk reload read, for the one `update` a `refresh` makes;
   * also drops any path no longer among `files` at all (deleted, reverted, renamed away).
   */
  function prunedStagedAll(
    files: readonly ChangedFile[],
    hunks: ReadonlyMap<string, readonly Hunk[]>,
  ): ReadonlyMap<string, ReadonlySet<string>> {
    let staged = model.stagedHunks
    if (staged.size === 0) return staged

    const live = new Set(files.map(file => file.path))
    if ([...staged.keys()].some(path => !live.has(path))) {
      staged = new Map([...staged].filter(([path]) => live.has(path)))
    }

    for (const [path, pathHunks] of hunks) {
      const current = staged.get(path)
      if (!current || current.size === 0) continue
      const headers = new Set(pathHunks.map(hunk => hunk.header))
      const kept = new Set([...current].filter(header => headers.has(header)))
      if (kept.size !== current.size) staged = new Map(staged).set(path, kept)
    }
    return staged
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

    // A turn source's hunks come from the controller's own `turnHunks`, read straight off it;
    // only a git source needs this bulk read.
    let hunks: ReadonlyMap<string, readonly Hunk[]> = new Map()
    let stagedHunks = model.stagedHunks
    if (!sourceController.isReadOnly()) {
      const loaded = await loadAllHunks(host.run, files, sourceController.base()).catch(
        loggedAs(host, 'loading hunks', { byPath: new Map(), truncatedPath: null }),
      )
      if (started !== generation) return
      hunks = loaded.byPath
      // A header collides easily (e.g. `@@ -1,2 +1,2 @@`); drop a path's stale staged marks
      // rather than risk a new hunk reading as already staged.
      stagedHunks = prunedStagedAll(files, hunks)
      if (loaded.truncatedPath !== null)
        host.toast(`${loaded.truncatedPath}: diff too large, its last hunk is not shown`)
    }

    // An edit noted before this refresh learned the toplevel (e.g. the session's very first edit,
    // ahead of the auto-open refresh that first loads the repository) sat in `pendingEdited`
    // absolute; resolve it against the toplevel this refresh now knows, same as `relativeOf` does
    // for a fresh edit. While the toplevel is still unknown (no repository yet), every entry stays
    // pending; once it is known, one that turns out to lie outside the repository is dropped.
    const toplevel = repository?.toplevel
    const stillPending: string[] = []
    const newlyResolved: string[] = []
    for (const abs of model.pendingEdited) {
      if (toplevel === undefined) stillPending.push(abs)
      else if (abs.startsWith(`${toplevel}/`)) newlyResolved.push(abs.slice(toplevel.length + 1))
    }
    const edited =
      newlyResolved.length === 0 ? model.edited : new Set([...model.edited, ...newlyResolved])
    const pendingEdited =
      stillPending.length === model.pendingEdited.size ? model.pendingEdited : new Set(stillPending)

    update({
      repository,
      isLoaded: true,
      hunks,
      stagedHunks,
      selected: isKept ? model.selected : (files[0]?.path ?? null),
      edited,
      pendingEdited,
    })

    if (repository) await review.load(repository.toplevel)
    followIfDue()
  }

  /**
   * Selects `path` and scrolls its heading to the top of the stream; no reload. Always jumps,
   * even when `path` is already selected — pressing the row of the file the scroll bar's ❯
   * already tracks is exactly how the stream's top is recovered after scrolling away from it.
   * The person's own navigation (a file-list press, the ↓/↑ buttons): turns follow off for the
   * rest of the turn, same as a scroll. A programmatic jump (`reveal`) does its own update
   * instead, so a directive or a follow-driven jump never trips this.
   */
  function select(path: string) {
    update({
      selected: path,
      composing: null,
      top: lastTitleRows.get(path) ?? model.top,
      pendingReveal: null,
      isFollowing: false,
      followPath: null,
    })
  }

  /** Moves the selection `by` files (1 next, -1 previous); the ↓/↑ buttons. */
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
    const { hunks: current } = await readHunks(file)
    const stillPresent = current.some(
      candidate => candidate.header === hunk.header && candidate.text === hunk.text,
    )
    if (!stillPresent) {
      host.toast('The hunk changed — refreshed, try again')
      update(withHunks(file.path, current))
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
    await refresh()
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

  /** Every changed file's blocks in one stream, cached while its inputs are unchanged. */
  function streamFor(capabilities: Capabilities): Stream {
    const files = filesOf()
    const source = sourceController.source()
    const readOnly = sourceController.isReadOnly()
    const comments = review.comments()

    if (
      cache &&
      cache.files === files &&
      cache.hunks === model.hunks &&
      cache.comments === comments &&
      cache.composing === model.composing &&
      cache.readOnly === readOnly &&
      cache.capabilities.canType === capabilities.canType &&
      cache.capabilities.canPick === capabilities.canPick &&
      cache.isLoaded === model.isLoaded
    ) {
      return cache.stream
    }

    const stream = streamOf(
      files,
      file => selectedHunksOf(source, sourceController.hunksFor(file), model.hunks.get(file.path)),
      comments,
      model.composing,
      {
        readOnly,
        capabilities,
        // Once the repository has loaded, a file absent from `model.hunks` was genuinely not
        // read (an untracked file past the cap, or a failed `git diff`), not still loading.
        unreadText: model.isLoaded ? 'Not read' : undefined,
      },
    )
    cache = {
      files,
      hunks: model.hunks,
      comments,
      composing: model.composing,
      readOnly,
      capabilities,
      isLoaded: model.isLoaded,
      stream,
    }
    return stream
  }

  /**
   * One fixed row's element, by its payload kind: a `gap` draws one blank row, between files.
   * `contentWidth` is the row's room beside the file's left rail (`kit.columns - 2`), for whatever
   * here measures text instead of `kit.columns` — the rail itself is drawn by the caller,
   * `placedRowOf`.
   */
  function bodyRowOf(
    kit: Kit,
    item: BodyItem,
    file: ChangedFile,
    contentWidth: number,
  ): RenderElement {
    const { Box, Text } = kit.ui
    switch (item.kind) {
      case 'title': {
        const mark = statusMarkOf(item.file.status)
        const icon = iconOf(item.file.path)
        return (
          <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
            <Text color={mark.color} wrap="truncate-end">
              {mark.glyph}
            </Text>
            <Text color={icon.color} wrap="truncate-end">
              {icon.glyph}
            </Text>
            <Text bold wrap="truncate-end">
              {item.file.path}
            </Text>
            <Text color={COLORS.added} wrap="truncate-end">
              +{item.file.adds}
            </Text>
            <Text color={COLORS.removed} wrap="truncate-end">
              −{item.file.dels}
            </Text>
            {item.canNote
              ? noteButton(kit, { path: item.file.path }, '＋ note on file', startComposing)
              : null}
          </Box>
        )
      }
      case 'status':
        return <Text dimColor>{item.text}</Text>
      case 'gap':
        return <Text> </Text>
      case 'outdated-title':
        return outdatedTitle(kit)
      case 'addressed':
        return addressedRow(kit, item.anchor, item.count)
      case 'note':
        return note(kit, item.comment, id => review.remove(id), review.resend)
      case 'comment-box':
        return commentBox(kit, {
          anchor: item.anchor,
          inputKey: inputKeyOf(item.anchor),
          hunk: item.hunk,
          hasPicker: item.hasPicker,
          line: model.composingLine,
          columns: contentWidth,
          onLineChange: line => update({ composingLine: line }),
          onSubmit: text => submitComment(item.anchor, text),
          onCancel: () => stopComposing(item.anchor),
        })
      case 'hunk-actions':
        return hunkActionsRow(kit, {
          anchor: item.anchor,
          canNote: item.canNote,
          isStaged: (model.stagedHunks.get(file.path) ?? EMPTY_STAGED).has(item.hunk.header),
          confirmingRevert: isArmed(anchorKeyOf(item.anchor)),
          onStartNote: startComposing,
          onStage: () => void applyHunk(file, item.hunk, 'stage'),
          onRevert: () => pressRevert(file, item.hunk, item.anchor),
        })
    }
  }

  /**
   * A placed block's element; the file it belongs to is found by its key's `path#...` prefix.
   * Every row of a file's section carries a 2-column left rail, `▌ ` in the file's status
   * colour, drawn here rather than by `bodyRowOf` so that function stays about one row's content.
   * A hunk `Code` slice spans several terminal rows at once, so its rail is a `Text` of that many
   * `▌ ` lines; the blank gap row between files carries no rail at all.
   */
  function placedRowOf(
    kit: Kit,
    placed: Placed<BodyItem>,
    filesByPath: ReadonlyMap<string, ChangedFile>,
  ): RenderElement {
    const { Box, Code, Text } = kit.ui
    const { block } = placed
    const path = block.key.slice(0, block.key.indexOf('#'))
    const file = filesByPath.get(path)
    if (!file) return <Box key={block.key} />

    const contentWidth = Math.max(1, kit.columns - 2)
    const railColor = statusMarkOf(file.status).color

    if (block.kind === 'hunk') {
      const rows = placed.to - placed.from
      const rail = `${'▌ \n'.repeat(Math.max(0, rows - 1))}▌ `
      return (
        <Box key={block.key} flexDirection="row" overflow="hidden" flexWrap="nowrap">
          <Text color={railColor}>{rail}</Text>
          <Box flexGrow={1} overflow="hidden">
            <Code
              source={sliceHunk(block.hunk, placed.from, placed.to).text}
              format="diff"
              path={file.path}
              wrap="truncate-end"
            />
          </Box>
        </Box>
      )
    }

    const { item } = block
    if (item.kind === 'gap') {
      return <Box key={block.key}>{bodyRowOf(kit, item, file, contentWidth)}</Box>
    }

    return (
      <Box key={block.key} flexDirection="row" overflow="hidden" flexWrap="nowrap">
        <Text color={railColor}>▌ </Text>
        <Box flexGrow={1} overflow="hidden">
          {bodyRowOf(kit, item, file, contentWidth)}
        </Box>
      </Box>
    )
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

    const stream = streamFor(kit.capabilities)
    lastTitleRows = stream.titleRows
    lastContentRows = stream.contentRows

    // A `reveal` for a file not yet in the last stream (a refresh still in flight when it was
    // called) lands here once `streamFor` finally places it.
    const pendingRow =
      model.pendingReveal !== null ? stream.titleRows.get(model.pendingReveal) : undefined
    if (pendingRow !== undefined) model = { ...model, top: pendingRow, pendingReveal: null }

    const bodyRows = Math.max(0, kit.rows - fixedRowsOf(files.length, MAX_ROWS))
    lastBodyRows = bodyRows
    const top = clampTop(model.top, stream.contentRows, bodyRows)
    if (top !== model.top) model = { ...model, top }

    const placed = windowOf(stream.blocks, top, bodyRows)
    const filesByPath = new Map(files.map(file => [file.path, file]))

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
        {fileList(kit, { files, selected: model.selected, edited: model.edited, onSelect: select })}
        {/* One short of the full width, same as the 'rule' case above, and for the same reason. */}
        <Text dimColor>{'─'.repeat(Math.max(1, kit.columns - 1))}</Text>
        {placed.map(p => placedRowOf(kit, p, filesByPath))}
      </Box>
    )
  }

  function scroll(by: number): boolean {
    if (filesOf().length === 0) return false
    const bodyRows = lastBodyRows
    const size = Math.abs(by)
    // A wheel tick or arrow asks for a row or two; scale it to a readable step, as the terminal's
    // own scrollable views do. A page or Home/End key already asks for a step this size or more.
    const step = size >= bodyRows ? size : size * WHEEL_ROWS
    const top = clampTop(model.top + Math.sign(by) * step, lastContentRows, bodyRows)
    if (top !== model.top) {
      update({
        top,
        selected: fileAtRow(lastTitleRows, top) ?? model.selected,
        isFollowing: false,
        followPath: null,
        pendingReveal: null,
      })
    } else if (model.isFollowing) {
      update({ isFollowing: false, followPath: null, pendingReveal: null })
    }
    return true
  }

  /** `abs`, relative to the repository's toplevel; null when the toplevel is unknown or `abs` lies outside it. */
  function relativeOf(abs: string): string | null {
    const toplevel = model.repository?.toplevel
    return toplevel && abs.startsWith(`${toplevel}/`) ? abs.slice(toplevel.length + 1) : null
  }

  /**
   * Selects the file at an absolute path, when it is among the changes. When it isn't yet in the
   * last render's title rows (a refresh still in flight), the jump is deferred to `render` via
   * `pendingReveal` rather than left at the view's current `top`. A programmatic jump (a `diff`
   * directive naming a path): never touches follow, unlike `select`, which is the person's own
   * navigation.
   */
  function reveal(path: string) {
    const relative = relativeOf(path)
    if (relative === null) return
    if (lastTitleRows.has(relative)) {
      update({
        selected: relative,
        composing: null,
        top: lastTitleRows.get(relative) ?? model.top,
        pendingReveal: null,
      })
    } else {
      update({ selected: relative, composing: null, pendingReveal: relative })
    }
  }

  /**
   * Applies `model.followPath`, once a refresh completes, as a `pendingReveal` rather than an
   * immediate `select` — unlike `reveal`, so the jump always lands against the stream `render`
   * computes fresh this time, never a possibly-stale `lastTitleRows` from before this refresh.
   * Only while still following (no person scroll this turn dropped it already); a compose box
   * open keeps the target rather than applying or dropping it, so the jump still happens once the
   * box closes and a later refresh runs.
   */
  function followIfDue() {
    if (!model.isFollowing || model.followPath === null) return
    const relative = relativeOf(model.followPath)
    if (relative === null) {
      update({ followPath: null })
    } else if (model.composing === null) {
      update({ selected: relative, composing: null, pendingReveal: relative, followPath: null })
    }
  }

  /**
   * Marks `abs` edited this turn; while still following (no person scroll this turn), it becomes
   * the next refresh's follow target, replacing whichever earlier edit this turn was following.
   * Resolved to a path relative to the repository when the toplevel is already known; otherwise
   * queued in `pendingEdited` absolute, for `refresh` to resolve once it learns the toplevel (the
   * session's very first edit can land before the auto-open refresh that first loads it).
   */
  function noteEdited(abs: string) {
    const relative = relativeOf(abs)
    const followPath = model.isFollowing ? abs : model.followPath
    if (relative === null) {
      update({ pendingEdited: new Set(model.pendingEdited).add(abs), followPath })
    } else {
      update({ edited: new Set(model.edited).add(relative), followPath })
    }
  }

  /** Clears this turn's edited marks and resumes following, for the next turn. */
  function turnEnded() {
    update({
      edited: EMPTY_EDITED,
      pendingEdited: EMPTY_EDITED,
      followPath: null,
      isFollowing: true,
    })
  }

  return {
    pane: DIFF_PANE,
    subcommand: 'diff',
    render,
    refresh,
    reveal,
    scroll,
    noteEdited,
    turnEnded,
  }
}

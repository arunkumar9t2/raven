/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Host } from '../core/host'
import type { Kit, View } from '../core/view'
import type { ChangedFile } from '../git/changes'
import type { Hunk } from '../git/hunks'
import { loadChanges, loadHunks } from '../git/load'
import { DIFF_PANE } from '../names'
import { commentsOn } from '../review/comments'
import type { Review } from '../review/review'
import { blocksOf, commentBoxKeyOf, noteKeyOf, STATUS_KEY, TITLE_KEY } from './diff/blocks'
import { type Anchor, commentBox, notes } from './diff/comment-box'
import { fileList, MAX_ROWS } from './diff/file-list'
import { header } from './diff/header'
import { clampTop, contentRowsOf, sliceHunk, windowOf } from './diff/layout'

const HEADER_ROWS = 1
const RULE_ROWS = 1
// A wheel tick reports a row or two; the terminal's own scrollable views move a few rows per tick.
const WHEEL_ROWS = 3

type Model = {
  repository: { toplevel: string; files: readonly ChangedFile[] } | null
  isLoaded: boolean
  selected: string | null
  hunks: ReadonlyMap<string, readonly Hunk[]>
  composing: Anchor | null
  top: number
}

/** What the diff view asks of the controller. */
export type DiffActions = {
  /** Submits the pending review to Claude. */
  send: () => void
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
    top: 0,
  }

  // The body rows the most recent render was given, so `scroll` can clamp without a render.
  let lastRows = 0

  const update = (patch: Partial<Model>) => {
    model = { ...model, ...patch }
    host.redraw()
  }

  const selectedFile = () =>
    model.repository?.files.find(file => file.path === model.selected) ?? null

  // Bumped by each refresh, so a slow read that lands after a newer one is dropped.
  let generation = 0

  async function loadSelected() {
    const file = selectedFile()
    if (!file) return
    const started = generation
    const hunks = await loadHunks(host.run, file).catch((): Hunk[] => [])
    const isCurrent = started === generation && model.selected === file.path
    if (isCurrent) update({ hunks: new Map(model.hunks).set(file.path, hunks) })
  }

  async function refresh() {
    const started = ++generation
    const repository = await loadChanges(host.run).catch(() => null)
    if (started !== generation) return
    const files = repository?.files ?? []
    const isKept = files.some(file => file.path === model.selected)

    update({
      repository,
      isLoaded: true,
      hunks: new Map(),
      selected: isKept ? model.selected : (files[0]?.path ?? null),
    })

    if (repository) await review.load(repository.toplevel)
    await loadSelected()
  }

  function select(path: string) {
    if (path === model.selected) return
    update({ selected: path, composing: null, top: 0 })
    void loadSelected()
  }

  const inputKeyOf = (anchor: Anchor) => `input:${anchor.path}|${anchor.hunk ?? ''}`

  function startComposing(anchor: Anchor) {
    update({ composing: anchor })
    actions.focus(inputKeyOf(anchor))
  }

  function submitComment(anchor: Anchor, text: string) {
    if (text.trim() !== '') review.add({ ...anchor, text: text.trim() })
    update({ composing: null })
  }

  function blocksForSelected() {
    const file = selectedFile()
    if (!file) return { file: null, blocks: [] }
    return {
      file,
      blocks: blocksOf(file, model.hunks.get(file.path), review.comments(), model.composing),
    }
  }

  /** The fixed-row elements a render places into the window, keyed exactly as `blocksOf` keys them. */
  function elementsOf(kit: Kit, file: ChangedFile): Map<string, RenderElement> {
    const { Text } = kit.ui
    const elements = new Map<string, RenderElement>()

    const addAnchor = (anchor: Anchor) => {
      const comments = commentsOn(review.comments(), anchor.path, anchor.hunk)
      const rows = notes(kit, {
        anchor,
        comments: review.comments(),
        onRemove: id => review.remove(id),
      })
      comments.forEach((comment, i) => {
        elements.set(noteKeyOf(comment.id), rows[i] as RenderElement)
      })
      elements.set(
        commentBoxKeyOf(anchor),
        commentBox(kit, {
          anchor,
          composing: model.composing,
          inputKey: inputKeyOf(anchor),
          onStart: startComposing,
          onSubmit: text => submitComment(anchor, text),
          onCancel: () => update({ composing: null }),
        }),
      )
    }

    elements.set(
      TITLE_KEY,
      <Text bold key={TITLE_KEY}>
        {file.path}
      </Text>,
    )
    addAnchor({ path: file.path })

    const hunks = model.hunks.get(file.path)
    if (hunks === undefined) {
      elements.set(
        STATUS_KEY,
        <Text dimColor key={STATUS_KEY}>
          Loading…
        </Text>,
      )
    } else if (hunks.length === 0) {
      elements.set(
        STATUS_KEY,
        <Text dimColor key={STATUS_KEY}>
          {file.isBinary ? 'Binary file' : 'No textual changes'}
        </Text>,
      )
    } else {
      for (const hunk of hunks) addAnchor({ path: file.path, hunk: hunk.header })
    }

    return elements
  }

  function render(kit: Kit): RenderElement {
    const { Box, Text, Code } = kit.ui
    const { repository } = model

    if (!model.isLoaded) return <Text dimColor>Reading the repository…</Text>
    if (!repository) return <Text dimColor>Not in a git repository.</Text>
    if (repository.files.length === 0) return <Text dimColor>No uncommitted changes.</Text>

    const file = selectedFile()
    const { blocks } = blocksForSelected()

    lastRows = kit.rows
    const bodyRows = Math.max(0, kit.rows - fixedRowsOf(repository.files.length))
    const top = clampTop(model.top, contentRowsOf(blocks), bodyRows)
    if (top !== model.top) model = { ...model, top }

    const elements = file ? elementsOf(kit, file) : new Map<string, RenderElement>()
    const placed = file ? windowOf(blocks, top, bodyRows) : []

    return (
      <Box flexDirection="column">
        {header(kit, {
          files: repository.files,
          pending: review.pending().length,
          onRefresh: () => void refresh(),
          onSend: actions.send,
        })}
        {fileList(kit, { files: repository.files, selected: model.selected, onSelect: select })}
        <Text dimColor>{'─'.repeat(Math.max(1, kit.columns - 1))}</Text>
        {placed.map(p =>
          p.block.kind === 'hunk' ? (
            <Code
              key={p.block.key}
              source={sliceHunk(p.block.hunk, p.from, p.to).text}
              format="diff"
              path={(file as ChangedFile).path}
              wrap="truncate-end"
            />
          ) : (
            <Box key={p.block.key}>{elements.get(p.block.key)}</Box>
          ),
        )}
      </Box>
    )
  }

  function scroll(by: number): boolean {
    const { file, blocks } = blocksForSelected()
    if (!file) return false
    const bodyRows = Math.max(0, lastRows - fixedRowsOf(model.repository?.files.length ?? 0))
    const contentRows = contentRowsOf(blocks)
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

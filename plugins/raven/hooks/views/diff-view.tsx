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
import type { CommentLine, Comments } from '../review/comments'
import type { Review } from '../review/review'
import { type Anchor, inputKeyOf } from './diff/anchor'
import { type BodyItem, blocksOf } from './diff/blocks'
import { addressedRow, commentBox, note, outdatedTitle } from './diff/comment-box'
import { fileList, MAX_ROWS } from './diff/file-list'
import { header } from './diff/header'
import {
  type Block,
  clampTop,
  contentRowsOf,
  type Placed,
  sliceHunk,
  windowOf,
} from './diff/layout'

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
  /** The line picked in the composing anchor's Select; null is "whole hunk". */
  composingLine: CommentLine | null
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
    composingLine: null,
    top: 0,
  }

  // The body rows the most recent render computed, so `scroll` can clamp without recomputing it.
  let lastBodyRows = 0

  // The last blocksOf() result, valid while its inputs are reference-equal to these.
  let cache: {
    file: ChangedFile
    hunks: readonly Hunk[] | undefined
    comments: Comments
    composing: Anchor | null
    blocks: Block<BodyItem>[]
    contentRows: number
  } | null = null

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

  function startComposing(anchor: Anchor) {
    update({ composing: anchor, composingLine: null })
    actions.focus(inputKeyOf(anchor))
  }

  function submitComment(anchor: Anchor, text: string) {
    if (text.trim() !== '') {
      const line = model.composingLine
      review.add(line ? { ...anchor, line, text: text.trim() } : { ...anchor, text: text.trim() })
    }
    update({ composing: null, composingLine: null })
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

    if (
      cache &&
      cache.file === file &&
      cache.hunks === hunks &&
      cache.comments === comments &&
      cache.composing === model.composing
    ) {
      return { file, blocks: cache.blocks, contentRows: cache.contentRows }
    }

    const blocks = blocksOf(file, hunks, comments, model.composing)
    const contentRows = contentRowsOf(blocks)
    cache = { file, hunks, comments, composing: model.composing, blocks, contentRows }
    return { file, blocks, contentRows }
  }

  /** One fixed row's element, by its payload kind; `null` renders as a blank row (e.g. a gap). */
  function bodyRowOf(kit: Kit, item: BodyItem): RenderElement | null {
    const { Text } = kit.ui
    switch (item.kind) {
      case 'title':
        return <Text bold>{item.file.path}</Text>
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
          onStart: startComposing,
          onLineChange: line => update({ composingLine: line }),
          onSubmit: text => submitComment(item.anchor, text),
          onCancel: () => update({ composing: null, composingLine: null }),
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

    return <Box key={block.key}>{bodyRowOf(kit, block.item)}</Box>
  }

  function render(kit: Kit): RenderElement {
    const { Box, Text } = kit.ui
    const { repository } = model

    if (!model.isLoaded) return <Text dimColor>Reading the repository…</Text>
    if (!repository) return <Text dimColor>Not in a git repository.</Text>
    if (repository.files.length === 0) return <Text dimColor>No uncommitted changes.</Text>

    const { file, blocks, contentRows } = blocksForSelected()

    const bodyRows = Math.max(0, kit.rows - fixedRowsOf(repository.files.length))
    lastBodyRows = bodyRows
    const top = clampTop(model.top, contentRows, bodyRows)
    if (top !== model.top) model = { ...model, top }

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

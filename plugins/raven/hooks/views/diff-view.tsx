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
import type { Review } from '../review/review'
import type { Anchor } from './diff/comment-box'
import { detail } from './diff/detail'
import { fileList } from './diff/file-list'
import { header } from './diff/header'

type Model = {
  repository: { toplevel: string; files: readonly ChangedFile[] } | null
  isLoaded: boolean
  selected: string | null
  hunks: ReadonlyMap<string, readonly Hunk[]>
  composing: Anchor | null
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

export function createDiffView(host: Host, review: Review, actions: DiffActions): DiffView {
  let model: Model = {
    repository: null,
    isLoaded: false,
    selected: null,
    hunks: new Map(),
    composing: null,
  }

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
    update({ selected: path, composing: null })
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

  function render(kit: Kit): RenderElement {
    const { Box, Text } = kit.ui
    const { repository } = model

    if (!model.isLoaded) return <Text dimColor>Reading the repository…</Text>
    if (!repository) return <Text dimColor>Not in a git repository.</Text>
    if (repository.files.length === 0) return <Text dimColor>No uncommitted changes.</Text>

    const file = selectedFile()

    return (
      <Box flexDirection="column" gap={1}>
        {header(kit, {
          files: repository.files,
          pending: review.comments().length,
          onRefresh: () => void refresh(),
          onSend: actions.send,
        })}
        {fileList(kit, { files: repository.files, selected: model.selected, onSelect: select })}
        <Text dimColor>{'─'.repeat(Math.max(1, kit.columns - 1))}</Text>
        {file
          ? detail(kit, {
              file,
              hunks: model.hunks.get(file.path),
              comments: review.comments(),
              composing: model.composing,
              inputKeyOf,
              onStartComposing: startComposing,
              onSubmitComment: submitComment,
              onCancelComposing: () => update({ composing: null }),
              onRemoveComment: id => review.remove(id),
            })
          : null}
      </Box>
    )
  }

  function reveal(path: string) {
    const toplevel = model.repository?.toplevel
    if (toplevel && path.startsWith(`${toplevel}/`)) select(path.slice(toplevel.length + 1))
  }

  return { pane: DIFF_PANE, subcommand: 'diff', render, refresh, reveal }
}

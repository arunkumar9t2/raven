/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Host } from '../core/host'
import type { Kit, View } from '../core/view'
import type { ChangedFile } from '../git/changes'
import { clampHunk, type Hunk } from '../git/hunks'
import { loadChanges, loadHunks } from '../git/load'
import { DIFF_PANE } from '../names'
import { commentsOn } from '../review/comments'
import type { Review } from '../review/review'
import { iconOf, statusMarkOf } from './icons'

/** Where a new comment is being typed: a file, or one of its hunks. */
type Anchor = { path: string; hunk?: string }

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

const sameAnchor = (a: Anchor | null, b: Anchor) => a?.path === b.path && a?.hunk === b.hunk

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

  function commentBox(kit: Kit, anchor: Anchor): RenderElement {
    const { Box, Button, Input } = kit.ui
    const key = `${anchor.path}|${anchor.hunk ?? ''}`

    if (!sameAnchor(model.composing, anchor)) {
      return (
        <Button
          key={`comment:${key}`}
          plain
          dimColor
          label={anchor.hunk ? '＋ comment on this hunk' : '＋ comment on this file'}
          onPress={() => startComposing(anchor)}
        />
      )
    }

    return (
      <Box flexDirection="column">
        <Input
          key={inputKeyOf(anchor)}
          autoFocus
          placeholder="Your comment for Claude…"
          submitLabel="add"
          onSubmit={text => {
            if (text.trim() !== '') review.add({ ...anchor, text: text.trim() })
            update({ composing: null })
          }}
        />
        <Button
          key={`cancel:${key}`}
          plain
          dimColor
          label="cancel"
          onPress={() => update({ composing: null })}
        />
      </Box>
    )
  }

  function notes(kit: Kit, anchor: Anchor): RenderElement[] {
    const { Box, Text, Button } = kit.ui
    return commentsOn(review.comments(), anchor.path, anchor.hunk).map(comment => (
      <Box key={`note:${comment.id}`} flexDirection="row" gap={1}>
        <Text color="#e0af68">▍ {comment.text}</Text>
        <Button
          key={`drop:${comment.id}`}
          plain
          dimColor
          label="✕"
          onPress={() => review.remove(comment.id)}
        />
      </Box>
    ))
  }

  function fileRow(kit: Kit, file: ChangedFile): RenderElement {
    const { Box, Text, Button } = kit.ui
    const icon = iconOf(file.path)
    const mark = statusMarkOf(file.status)
    const isSelected = file.path === model.selected

    return (
      <Box key={`row:${file.path}`} flexDirection="row" gap={1}>
        <Text color={mark.color}>
          {isSelected ? '❯' : ' '} {mark.glyph}
        </Text>
        <Text color={icon.color}>{icon.glyph}</Text>
        <Button
          key={`file:${file.path}`}
          plain
          label={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
          onPress={() => select(file.path)}
        />
        <Text color="green">+{file.adds}</Text>
        <Text color="red">−{file.dels}</Text>
      </Box>
    )
  }

  function detail(kit: Kit, file: ChangedFile): RenderElement {
    const { Box, Text, Code } = kit.ui
    const hunks = model.hunks.get(file.path)

    return (
      <Box flexDirection="column" gap={1}>
        <Text bold>{file.path}</Text>
        {notes(kit, { path: file.path })}
        {commentBox(kit, { path: file.path })}
        {hunks === undefined ? (
          <Text dimColor>Loading…</Text>
        ) : hunks.length === 0 ? (
          <Text dimColor>{file.isBinary ? 'Binary file' : 'No textual changes'}</Text>
        ) : (
          hunks.map((hunk, index) => (
            <Box key={`hunk:${index}:${hunk.header}`} flexDirection="column">
              <Code source={clampHunk(hunk).text} format="diff" path={file.path} />
              {notes(kit, { path: file.path, hunk: hunk.header })}
              {commentBox(kit, { path: file.path, hunk: hunk.header })}
            </Box>
          ))
        )}
      </Box>
    )
  }

  function header(kit: Kit, files: readonly ChangedFile[]): RenderElement {
    const { Box, Text, Button } = kit.ui
    const adds = files.reduce((sum, file) => sum + file.adds, 0)
    const dels = files.reduce((sum, file) => sum + file.dels, 0)
    const pending = review.comments().length

    return (
      <Box flexDirection="row" gap={2}>
        <Text bold>
          {files.length} {files.length === 1 ? 'file' : 'files'}
        </Text>
        <Text color="green">+{adds}</Text>
        <Text color="red">−{dels}</Text>
        <Button key="refresh" plain dimColor label="↻ refresh" onPress={() => void refresh()} />
        {pending > 0 ? (
          <Button
            key="send"
            label={`Send ${pending} ${pending === 1 ? 'comment' : 'comments'} to Claude`}
            onPress={actions.send}
          />
        ) : null}
      </Box>
    )
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
        {header(kit, repository.files)}
        <Box flexDirection="column">{repository.files.map(each => fileRow(kit, each))}</Box>
        <Text dimColor>{'─'.repeat(Math.max(1, kit.columns - 1))}</Text>
        {file ? detail(kit, file) : null}
      </Box>
    )
  }

  function reveal(path: string) {
    const toplevel = model.repository?.toplevel
    if (toplevel && path.startsWith(`${toplevel}/`)) select(path.slice(toplevel.length + 1))
  }

  return { pane: DIFF_PANE, subcommand: 'diff', render, refresh, reveal }
}

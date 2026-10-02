/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Host } from '../core/host'
import type { Kit, View } from '../core/view'
import { loadChanges, toplevelOf } from '../git/load'
import { TREE_PANE } from '../names'
import { dot } from '../ui/dot'
import { clampTop } from './diff/layout'
import { iconOf, statusMarkOf } from './icons'
import {
  changedDirsOf,
  listingKeyOf,
  pathsOf,
  rowsOf,
  type TreeNode,
  type TreeRow,
  treeOf,
} from './tree/tree'

/** What the tree view asks of the controller when a file row is pressed. */
export type TreeActions = {
  open: (absolutePath: string) => void
}

export type TreeView = View & {
  /** `force` re-lists even when the change set can't explain a new file appearing. */
  refresh: (options?: { force?: boolean }) => Promise<void>
}

type Model = {
  isLoaded: boolean
  toplevel: string | null
  root: TreeNode | null
  isCapped: boolean
  expanded: ReadonlySet<string>
  top: number
}

type Row = { kind: 'node'; row: TreeRow } | { kind: 'capped' }

function rowsFor(model: Model): Row[] {
  if (!model.root) return []
  const rows: Row[] = rowsOf(model.root, model.expanded).map(row => ({ kind: 'node', row }))
  if (model.isCapped) rows.push({ kind: 'capped' })
  return rows
}

/**
 * `rowsFor`, recomputed only when the tree, its expanded set or its cap changes: a scroll or a
 * redraw replaces the model without touching any of them.
 */
function cachedRowsFor(): (model: Model) => Row[] {
  let last: { root: Model['root']; expanded: Model['expanded']; isCapped: boolean; rows: Row[] } = {
    root: null,
    expanded: new Set(),
    isCapped: false,
    rows: [],
  }
  return model => {
    if (
      model.root !== last.root ||
      model.expanded !== last.expanded ||
      model.isCapped !== last.isCapped
    ) {
      last = { ...model, rows: rowsFor(model) }
    }
    return last.rows
  }
}

export function createTreeView(host: Host, actions: TreeActions): TreeView {
  const rowsOfModel = cachedRowsFor()
  let model: Model = {
    isLoaded: false,
    toplevel: null,
    root: null,
    isCapped: false,
    expanded: new Set(),
    top: 0,
  }
  let hasExpandedOnce = false
  let lastRows = 0

  // Bumped by each refresh, so a slow read that lands after a newer one is dropped.
  let generation = 0

  // The last `git ls-files` listing, kept so an unchanged file set can skip re-listing; null until
  // the first successful listing.
  let listing: { toplevel: string; paths: string[]; isCapped: boolean; key: string } | null = null

  const update = (patch: Partial<Model>) => {
    model = { ...model, ...patch }
    host.redraw()
  }

  const listFiles = () =>
    host.run(['git', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'])

  async function refresh(options?: { force?: boolean }): Promise<void> {
    const started = ++generation
    const toplevel = await toplevelOf(host.run)
    if (toplevel === null) {
      if (started === generation) update({ isLoaded: true, toplevel: null, root: null })
      return
    }
    const mustList = options?.force === true || listing === null || listing.toplevel !== toplevel

    let paths: string[]
    let isCapped: boolean
    let changes: Awaited<ReturnType<typeof loadChanges>>
    let key: string

    if (mustList) {
      const [ls, loaded] = await Promise.all([
        listFiles(),
        loadChanges(host.run, { kind: 'head' }).catch(() => null),
      ])
      if (started !== generation) return
      ;({ paths, isCapped } = pathsOf(ls.stdout))
      changes = loaded
      key = listingKeyOf(changes?.files ?? [])
    } else {
      changes = await loadChanges(host.run, { kind: 'head' }).catch(() => null)
      if (started !== generation) return
      key = listingKeyOf(changes?.files ?? [])
      if (key === listing?.key) {
        ;({ paths, isCapped } = listing)
      } else {
        const ls = await listFiles()
        if (started !== generation) return
        ;({ paths, isCapped } = pathsOf(ls.stdout))
      }
    }

    listing = { toplevel, paths, isCapped, key }

    const changed = new Map((changes?.files ?? []).map(file => [file.path, file.status]))
    const root = treeOf(paths, changed)
    const expanded = hasExpandedOnce ? model.expanded : changedDirsOf(root)
    hasExpandedOnce = true

    update({ isLoaded: true, toplevel, root, isCapped, expanded })
  }

  function toggle(path: string) {
    const expanded = new Set(model.expanded)
    if (expanded.has(path)) expanded.delete(path)
    else expanded.add(path)
    update({ expanded })
  }

  function open(path: string) {
    if (model.toplevel) actions.open(`${model.toplevel}/${path}`)
  }

  function nodeRow(kit: Kit, row: TreeRow): RenderElement {
    const { Box, Text, Button } = kit.ui
    const indent = '  '.repeat(row.depth)

    if (row.node.kind === 'dir') {
      const arrow = row.isExpanded ? '▾' : '▸'
      return (
        <Box key={`dir:${row.node.path}`} flexDirection="row" gap={1}>
          <Text>{`${indent}${arrow}`}</Text>
          <Button
            key={`dir-btn:${row.node.path}`}
            plain
            label={row.node.name}
            onPress={() => toggle(row.node.path)}
          />
          {row.node.changed > 0 ? <Text dimColor>({row.node.changed})</Text> : null}
        </Box>
      )
    }

    const icon = iconOf(row.node.path)
    const mark = row.node.status ? statusMarkOf(row.node.status) : null
    return (
      <Box key={`file:${row.node.path}`} flexDirection="row" gap={1}>
        <Text>{indent}</Text>
        <Text color={icon.color}>{icon.glyph}</Text>
        <Button
          key={`file-btn:${row.node.path}`}
          plain
          label={row.node.name}
          onPress={() => open(row.node.path)}
        />
        {mark ? dot(kit, mark.color) : null}
      </Box>
    )
  }

  function render(kit: Kit): RenderElement {
    const { Box, Text } = kit.ui
    if (!model.isLoaded) return <Text dimColor>Reading the repository…</Text>
    if (!model.toplevel || !model.root) return <Text dimColor>Not in a git repository.</Text>

    const rows = rowsOfModel(model)
    lastRows = kit.rows
    const top = clampTop(model.top, rows.length, kit.rows)
    if (top !== model.top) model = { ...model, top }
    const windowed = rows.slice(top, top + kit.rows)

    return (
      <Box flexDirection="column">
        {windowed.map(item =>
          item.kind === 'capped' ? (
            <Text key="capped" dimColor>
              … capped at 5000 files
            </Text>
          ) : (
            nodeRow(kit, item.row)
          ),
        )}
      </Box>
    )
  }

  function scroll(by: number): boolean {
    if (!model.isLoaded) return false
    const total = rowsOfModel(model).length
    const top = clampTop(model.top + by, total, lastRows)
    if (top !== model.top) update({ top })
    return true
  }

  return { pane: TREE_PANE, subcommand: 'files', render, refresh, scroll }
}

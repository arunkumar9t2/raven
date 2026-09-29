/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Host } from '../core/host'
import type { Kit, View } from '../core/view'
import { DOC_PANE } from '../names'
import { baseName } from './icons'

/** A document the pane can show: a file read from disk, or markdown handed over inline. */
export type Doc =
  | { kind: 'file'; path: string; title?: string }
  | { kind: 'note'; markdown: string; title?: string }

type Shown = { key: string; title: string; doc: Doc; text: string | null; error?: string }

export type DocView = View & {
  show: (doc: Doc) => Promise<void>
  /** Re-reads the shown file when `path` is it, so edits to an open plan appear. */
  reload: (path: string) => Promise<void>
}

const HISTORY_LIMIT = 10
const CODE_SOURCE_LIMIT = 10_000

const isMarkdown = (path: string) => /\.(md|mdx|markdown)$/i.test(path)

const keyOf = (doc: Doc) => (doc.kind === 'file' ? `file:${doc.path}` : `note:${doc.title ?? ''}`)
const titleOf = (doc: Doc) => doc.title ?? (doc.kind === 'file' ? baseName(doc.path) : 'Note')

export function createDocView(host: Host): DocView {
  let history: readonly Shown[] = []
  let current: string | null = null

  async function read(doc: Doc): Promise<Pick<Shown, 'text' | 'error'>> {
    if (doc.kind === 'note') return { text: doc.markdown }
    try {
      return { text: await host.readFile(doc.path) }
    } catch (error) {
      return { text: null, error: error instanceof Error ? error.message : String(error) }
    }
  }

  async function show(doc: Doc) {
    const key = keyOf(doc)
    const shown: Shown = { key, title: titleOf(doc), doc, ...(await read(doc)) }
    history = [shown, ...history.filter(each => each.key !== key)].slice(0, HISTORY_LIMIT)
    current = key
    host.redraw()
  }

  async function reload(path: string) {
    const shown = history.find(each => each.doc.kind === 'file' && each.doc.path === path)
    if (!shown) return
    const next = { ...shown, ...(await read(shown.doc)) }
    history = history.map(each => (each.key === shown.key ? next : each))
    host.redraw()
  }

  function body(kit: Kit, shown: Shown): RenderElement {
    const { Text, Markdown, Code } = kit.ui
    if (shown.text === null) return <Text color="red">Could not read: {shown.error}</Text>
    if (shown.doc.kind === 'note' || isMarkdown(shown.doc.path))
      return <Markdown text={shown.text} />
    return (
      <Code source={shown.text.slice(0, CODE_SOURCE_LIMIT)} path={shown.doc.path} startLine={1} />
    )
  }

  function render(kit: Kit): RenderElement {
    const { Box, Text, Select } = kit.ui
    const shown = history.find(each => each.key === current)

    if (!shown)
      return <Text dimColor>Nothing shown yet. Plans and docs Claude writes open here.</Text>

    return (
      <Box flexDirection="column" gap={1}>
        {history.length > 1 ? (
          <Select
            key="history"
            label="Documents"
            value={shown.key}
            options={history.map(each => ({ value: each.key, label: each.title }))}
            onSelect={value => {
              current = value
              host.redraw()
            }}
          />
        ) : null}
        <Box flexDirection="column">
          <Text bold>{shown.title}</Text>
          {shown.doc.kind === 'file' ? <Text dimColor>{shown.doc.path}</Text> : null}
        </Box>
        {body(kit, shown)}
      </Box>
    )
  }

  return { pane: DOC_PANE, subcommand: 'doc', render, show, reload }
}

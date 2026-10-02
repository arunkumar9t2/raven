/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../core/colors'
import type { Host } from '../core/host'
import { ELEMENT_TEXT_LIMIT, type Kit, type View } from '../core/view'
import { DOC_PANE } from '../names'
import { docLinksOf, resolveDocLink } from './doc-links'
import { baseName } from './icons'
import { type DocBlock, docBlocksOf, markdownChunksOf } from './markdown-chunks'
import { selectButtons } from './select-buttons'

/** A document the pane can show: a file read from disk, or markdown handed over inline. */
export type Doc =
  | { kind: 'file'; path: string; title?: string }
  | { kind: 'note'; markdown: string; title?: string }

type Shown = { key: string; title: string; doc: Doc; text: string | null; error?: string }

type Chunk = { blocks: readonly DocBlock[]; links?: ReturnType<typeof docLinksOf> }

export type DocView = View & {
  show: (doc: Doc) => Promise<void>
  /** Re-reads the shown file when `path` is it, so edits to an open plan appear. */
  reload: (path: string) => Promise<void>
}

const HISTORY_LIMIT = 10

const isMarkdown = (path: string) => /\.(md|mdx|markdown)$/i.test(path)
const isImage = (path: string) => /\.(png|jpe?g|gif|webp)$/i.test(path)
/** The one image format an `Image` reads straight from a file. */
const isPng = (path: string) => /\.png$/i.test(path)

const keyOf = (doc: Doc) => (doc.kind === 'file' ? `file:${doc.path}` : `note:${doc.title ?? ''}`)
const titleOf = (doc: Doc) => doc.title ?? (doc.kind === 'file' ? baseName(doc.path) : 'Note')

export function createDocView(host: Host): DocView {
  let history: readonly Shown[] = []
  let current: string | null = null
  // A Shown is replaced, never mutated, on a reload, so its chunks are computed once, not per frame.
  const chunksByShown = new WeakMap<Shown, readonly Chunk[]>()

  function chunksOf(shown: Shown, text: string): readonly Chunk[] {
    const cached = chunksByShown.get(shown)
    if (cached) return cached
    const doc = shown.doc
    const chunks = markdownChunksOf(text).map(chunk => ({
      blocks: docBlocksOf(chunk),
      links: doc.kind === 'file' ? docLinksOf(doc.path, chunk) : undefined,
    }))
    chunksByShown.set(shown, chunks)
    return chunks
  }

  const pick = (value: string) => {
    current = value
    host.redraw()
  }

  async function read(doc: Doc): Promise<Pick<Shown, 'text' | 'error'>> {
    if (doc.kind === 'note') return { text: doc.markdown }
    if (isImage(doc.path)) return { text: '' }
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
    const { Box, Text, Markdown, Code } = kit.ui
    if (shown.doc.kind === 'file' && isImage(shown.doc.path)) {
      const path = shown.doc.path
      if (!kit.capabilities.canShowImage || !isPng(path)) return <Text dimColor>{path}</Text>
      // Safe here only: `canShowImage` is true on `terminal` alone, which always carries `Image`.
      const { Image } = kit.ui as Required<Kit['ui']>
      const columns = Math.max(1, Math.min(kit.columns, 60))
      const rows = Math.max(1, Math.round(columns / 2))
      return (
        <Image
          source={{ file: path, format: 'png' }}
          columns={columns}
          rows={rows}
          alt={baseName(path)}
        />
      )
    }
    if (shown.text === null) return <Text color={COLORS.error}>Could not read: {shown.error}</Text>
    if (shown.doc.kind === 'note' || isMarkdown(shown.doc.path)) {
      const doc = shown.doc
      return (
        <Box flexDirection="column">
          {chunksOf(shown, shown.text).flatMap((chunk, i) =>
            chunk.blocks.map((block, j) => {
              if (block.kind === 'code') {
                // R2: an empty fence has nothing to draw; the engine may refuse the whole drawing
                // if `Code` gets an empty source.
                if (block.text === '') return null
                return <Code key={`code:${i}:${j}`} source={block.text} language={block.language} />
              }
              return doc.kind === 'file' ? (
                <Markdown
                  key={`md:${i}:${j}`}
                  text={block.text}
                  pressableLinks={chunk.links}
                  onLinkPress={link => {
                    const target = resolveDocLink(doc.path, link.href)
                    if (target) void show({ kind: 'file', path: target })
                  }}
                />
              ) : (
                <Markdown key={`md:${i}:${j}`} text={block.text} />
              )
            }),
          )}
        </Box>
      )
    }
    const isCut = shown.text.length > ELEMENT_TEXT_LIMIT
    return (
      <Box flexDirection="column">
        <Code
          source={shown.text.slice(0, ELEMENT_TEXT_LIMIT)}
          path={shown.doc.path}
          startLine={1}
        />
        {isCut ? <Text dimColor>… the rest of the file is not shown</Text> : null}
      </Box>
    )
  }

  /** The last 3 docs as plain buttons, for a surface without `canPick` to pick a history entry. */
  function historyButtons(kit: Kit, shown: Shown): RenderElement {
    return selectButtons(kit, {
      key: 'history',
      options: history.slice(0, 3).map(each => ({ value: each.key, label: each.title })),
      value: shown.key,
      onSelect: pick,
    })
  }

  function render(kit: Kit): RenderElement {
    const { Box, Text } = kit.ui
    const shown = history.find(each => each.key === current)

    if (!shown)
      return <Text dimColor>Nothing shown yet. Plans and docs Claude writes open here.</Text>

    // Safe only inside the `canPick` branch below.
    const { Select } = kit.ui as Required<Kit['ui']>
    const picker =
      history.length <= 1 ? null : kit.capabilities.canPick ? (
        <Select
          key="history"
          label="Documents"
          value={shown.key}
          options={history.map(each => ({ value: each.key, label: each.title }))}
          onSelect={pick}
        />
      ) : (
        historyButtons(kit, shown)
      )

    return (
      <Box flexDirection="column" gap={1}>
        {picker}
        <Box flexDirection="row" gap={2} overflow="hidden" flexWrap="nowrap">
          {shown.doc.kind === 'file' && shown.doc.title ? (
            <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
              <Text bold>{shown.doc.title}</Text>
              <Text dimColor wrap="truncate-end">
                {shown.doc.path}
              </Text>
            </Box>
          ) : (
            <Text bold wrap="truncate-end">
              {shown.doc.kind === 'file' ? shown.doc.path : shown.title}
            </Text>
          )}
        </Box>
        {body(kit, shown)}
      </Box>
    )
  }

  return { pane: DOC_PANE, subcommand: 'doc', render, show, reload }
}

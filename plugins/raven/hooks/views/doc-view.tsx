/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../core/colors'
import type { Host } from '../core/host'
import { ELEMENT_TEXT_LIMIT, type Kit, type View } from '../core/view'
import { DOC_PANE } from '../names'
import type { Comment } from '../review/comments'
import { splitAddressed } from '../review/comments'
import type { Review } from '../review/review'
import { chipRow, chipsFit } from '../ui/chips'
import { row } from '../ui/row'
import { table } from '../ui/table'
import { type Anchor, anchorKeyOf, commentButtonKeyOf, inputKeyOf } from './diff/anchor'
import { addressedRow, commentBox, note, noteChip, outdatedTitle } from './diff/comment-box'
import { docLinksOf, resolveDocLink } from './doc-links'
import { type DocSection, docSectionsOf } from './doc-sections'
import { baseName } from './icons'
import { type DocBlock, docBlocksOf, markdownChunksOf } from './markdown-chunks'
import { selectButtons } from './select-buttons'

/** A document the pane can show: a file read from disk, or markdown handed over inline. */
export type Doc =
  | { kind: 'file'; path: string; title?: string }
  | { kind: 'note'; markdown: string; title?: string }

type Shown = { key: string; title: string; doc: Doc; text: string | null; error?: string }

type Chunk = { blocks: readonly DocBlock[]; links?: ReturnType<typeof docLinksOf> }

/** One commentable section, pre-split into its drawable chunks (prose/code, links). */
type SectionView = { section: DocSection; chunks: readonly Chunk[] }

export type DocActions = {
  /** Gives the keyboard to the element drawn under `key`, as the diff view's own `focus` does. */
  focus: (key: string) => void
}

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

/** The anchor for a doc section's controls, keyed by the section's INDEX, not its heading — two
 * sections sharing a heading never share controls. `hunk` only keys the controls; the comment
 * itself stores `section` (the heading) and `sectionIndex` (the index), never this string. */
const sectionAnchorOf = (path: string, index: number): Anchor => ({ path, hunk: `§${index}` })

export function createDocView(
  host: Host,
  review: Review,
  actions: DocActions,
  now: () => number,
): DocView {
  let history: readonly Shown[] = []
  let current: string | null = null
  let composing: Anchor | null = null
  // A Shown is replaced, never mutated, on a reload, so its chunks/sections are computed once,
  // not per frame.
  const chunksByShown = new WeakMap<Shown, readonly Chunk[]>()
  const sectionsByShown = new WeakMap<Shown, readonly SectionView[]>()

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

  /** `shown`'s sections, each pre-split into its own drawable chunks — commenting applies only
   * to a file doc (a comment needs a real path to anchor to; an inline 'note' doc has none). */
  function sectionsOf(shown: Shown, text: string): readonly SectionView[] {
    const cached = sectionsByShown.get(shown)
    if (cached) return cached
    const doc = shown.doc
    const sections = docSectionsOf(text).map(section => ({
      section,
      chunks: markdownChunksOf(section.text).map(chunk => ({
        blocks: docBlocksOf(chunk),
        links: doc.kind === 'file' ? docLinksOf(doc.path, chunk) : undefined,
      })),
    }))
    sectionsByShown.set(shown, sections)
    return sections
  }

  const pick = (value: string) => {
    current = value
    composing = null
    host.redraw()
  }

  function startComposing(anchor: Anchor) {
    composing = anchor
    host.redraw()
    actions.focus(inputKeyOf(anchor))
  }

  function stopComposing(anchor: Anchor) {
    composing = null
    host.redraw()
    actions.focus(commentButtonKeyOf(anchor))
  }

  function submitComment(path: string, heading: string, index: number, text: string) {
    const anchor = sectionAnchorOf(path, index)
    if (text.trim() !== '')
      review.add({ path, section: heading, sectionIndex: index, text: text.trim() })
    stopComposing(anchor)
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
    composing = null
    host.redraw()
  }

  async function reload(path: string) {
    const shown = history.find(each => each.doc.kind === 'file' && each.doc.path === path)
    if (!shown) return
    const next = { ...shown, ...(await read(shown.doc)) }
    history = history.map(each => (each.key === shown.key ? next : each))
    host.redraw()
  }

  /** A chunk's blocks as drawn elements: prose through `Markdown` (a file's with its pressable
   * links, following one to the doc it resolves to), code through `Code`. */
  function chunkElementsOf(
    kit: Kit,
    chunks: readonly Chunk[],
    doc: Doc,
    keyPrefix: string,
  ): (RenderElement | null)[] {
    const { Code, Markdown } = kit.ui
    return chunks.flatMap((chunk, i) =>
      chunk.blocks.map((block, j) => {
        // R36: the engine sizes a table to the terminal, not the pane, so Raven draws it, fitted
        // to the pane's width (the doc body adds no indent of its own).
        if (block.kind === 'table') {
          return table(kit, {
            key: `${keyPrefix}table:${i}:${j}`,
            header: block.header,
            align: block.align,
            rows: block.rows,
            width: kit.columns,
            // A blank row either side, like a Markdown block's own gap — none at the very start
            // or end of the section.
            gapTop: i > 0 || j > 0,
            gapBottom: i < chunks.length - 1 || j < chunk.blocks.length - 1,
          })
        }
        if (block.kind === 'code') {
          // R2: an empty fence has nothing to draw; the engine may refuse the whole drawing
          // if `Code` gets an empty source.
          if (block.text === '') return null
          return (
            <Code
              key={`${keyPrefix}code:${i}:${j}`}
              source={block.text}
              language={block.language}
            />
          )
        }
        return doc.kind === 'file' ? (
          <Markdown
            key={`${keyPrefix}md:${i}:${j}`}
            text={block.text}
            pressableLinks={chunk.links}
            onLinkPress={link => {
              const target = resolveDocLink(doc.path, link.href)
              if (target) void show({ kind: 'file', path: target })
            }}
          />
        ) : (
          <Markdown key={`${keyPrefix}md:${i}:${j}`} text={block.text} />
        )
      }),
    )
  }

  /**
   * A markdown file's body, per `docSectionsOf` section: its blocks, then its notes (the doc's
   * comments whose `section`/`sectionIndex` match this section — a comment with no `sectionIndex`
   * matches the first section with its heading), the compose box while composing, then an idle
   * `[ ✎ note ]` chip, right-aligned. A comment matching no section (its heading/index both gone)
   * draws at the end under a dim `Outdated` row instead of being dropped. Only comments carrying a
   * `section` ever draw here — the same discriminator `blocks.ts`'s orphan group uses — so a diff
   * comment (hunk- or file-level) on this same path, which carries none, stays out of the Doc pane
   * entirely and is left for the diff stream alone.
   */
  function sectionsBody(
    kit: Kit,
    shown: Shown,
    doc: Extract<Doc, { kind: 'file' }>,
    text: string,
  ): RenderElement {
    const { Box } = kit.ui
    const sections = sectionsOf(shown, text)
    const comments = review
      .comments()
      .filter(comment => comment.path === doc.path && comment.section !== undefined)

    // The first section carrying each heading, for an un-indexed (made elsewhere) comment to match.
    const firstIndexByHeading = new Map<string, number>()
    sections.forEach((sv, index) => {
      if (!firstIndexByHeading.has(sv.section.heading)) {
        firstIndexByHeading.set(sv.section.heading, index)
      }
    })

    const matchedIds = new Set<string>()
    const sectionElements = sections.map((sv, index) => {
      const heading = sv.section.heading
      const anchor = sectionAnchorOf(doc.path, index)
      const notes = comments.filter(comment => {
        if (comment.section !== heading) return false
        return comment.sectionIndex !== undefined
          ? comment.sectionIndex === index
          : firstIndexByHeading.get(heading) === index
      })
      notes.forEach(each => {
        matchedIds.add(each.id)
      })

      const isComposing =
        composing !== null && composing.path === anchor.path && composing.hunk === anchor.hunk
      const canNote = kit.capabilities.canType && !isComposing
      const chip = canNote ? noteChip(anchor, startComposing) : null

      // Addressed notes collapse to one dim "✓ N addressed" row, same as a diff anchor's own
      // `notesBlocksOf` (`diff/blocks.ts`) — one shared split (`splitAddressed`), one component
      // (`addressedRow`), so a section's notes read the same way wherever they draw.
      const { addressed, visible } = splitAddressed(notes)

      return (
        <Box key={`section:${index}`} flexDirection="column">
          {chunkElementsOf(kit, sv.chunks, doc, `s${index}:`)}
          {addressed.length > 0 ? addressedRow(kit, anchor, addressed.length) : null}
          {visible.map(comment =>
            note(kit, comment, now(), id => review.remove(id), review.resend, kit.columns),
          )}
          {isComposing
            ? commentBox(kit, {
                anchor,
                inputKey: inputKeyOf(anchor),
                hasPicker: false,
                line: null,
                columns: kit.columns,
                onLineChange: () => {},
                onSubmit: submitted => submitComment(doc.path, heading, index, submitted),
                onCancel: () => stopComposing(anchor),
              })
            : null}
          {chip
            ? row(kit, {
                left: '',
                // No `scope`: a single chip has no sibling in this row to hover-group with —
                // `chipRow` itself now runs any `scope` through `scopeOf` (hooks/ui/scope.ts),
                // so a doc's (often long) path is no longer the reason to omit one.
                right: chipRow(kit, [chip], chipsFit([chip], kit.columns)),
                // Distinct from the chip's own key (commentButtonKeyOf) — the row and the chip it
                // wraps must not share a key, or `ui.press`/`ui.input` can resolve the wrong node.
                key: `section-note:${anchorKeyOf(anchor)}`,
              })
            : null}
        </Box>
      )
    })

    const outdated = comments.filter(comment => !matchedIds.has(comment.id))

    // Grouped by the section identity each comment still carries (its heading and the index it
    // was made at, even though neither names a section on screen any more) — the same per-anchor
    // split and collapse (`splitAddressed`/`addressedRow`) a live section's notes use, so two
    // addressed comments orphaned from the same gone section still draw as one "N addressed" row.
    const outdatedGroups = new Map<string, Comment[]>()
    for (const comment of outdated) {
      const key = `${comment.section}\u0000${comment.sectionIndex ?? ''}`
      const group = outdatedGroups.get(key)
      if (group) group.push(comment)
      else outdatedGroups.set(key, [comment])
    }

    return (
      <Box flexDirection="column">
        {sectionElements}
        {outdated.length > 0 ? (
          <Box flexDirection="column">
            {outdatedTitle(kit)}
            {[...outdatedGroups.entries()].map(([key, group]) => {
              const { addressed, visible } = splitAddressed(group)
              const anchor: Anchor = { path: doc.path, hunk: `§outdated:${key}` }
              return (
                <Box key={`outdated:${key}`} flexDirection="column">
                  {addressed.length > 0 ? addressedRow(kit, anchor, addressed.length) : null}
                  {visible.map(comment =>
                    note(kit, comment, now(), id => review.remove(id), review.resend, kit.columns),
                  )}
                </Box>
              )
            })}
          </Box>
        ) : null}
      </Box>
    )
  }

  function body(kit: Kit, shown: Shown): RenderElement {
    const { Box, Text, Code, Image } = kit.ui
    if (shown.doc.kind === 'file' && isImage(shown.doc.path)) {
      const path = shown.doc.path
      if (!kit.capabilities.canShowImage || !isPng(path)) return <Text dimColor>{path}</Text>
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
    // Commenting applies only to a file doc: a comment anchors to `doc.path`, which an inline
    // 'note' doc has none of — it keeps the plain, uncommentable rendering it always had.
    if (shown.doc.kind === 'file' && isMarkdown(shown.doc.path)) {
      return sectionsBody(kit, shown, shown.doc, shown.text)
    }
    if (shown.doc.kind === 'note') {
      return (
        <Box flexDirection="column">
          {chunkElementsOf(kit, chunksOf(shown, shown.text), shown.doc, '')}
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
    const { Box, Text, Select } = kit.ui
    const shown = history.find(each => each.key === current)

    if (!shown)
      return <Text dimColor>Nothing shown yet. Plans and docs Claude writes open here.</Text>

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

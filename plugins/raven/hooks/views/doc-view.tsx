/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS, RAINBOW } from '../core/colors'
import type { Host } from '../core/host'
import { ELEMENT_TEXT_LIMIT, type Kit, type View } from '../core/view'
import { DOC_PANE } from '../names'
import type { Comment } from '../review/comments'
import { splitAddressed } from '../review/comments'
import type { Review } from '../review/review'
import { fill, ruleRow } from '../ui/card'
import { chipsFit } from '../ui/chips'
import { EMPTY_ICONS, emptyState } from '../ui/empty'
import { pillRow } from '../ui/strip'
import { table } from '../ui/table'
import { type DrawnLine, drawnRowsOf, layoutTable } from '../ui/table-layout'
import { type Anchor, anchorKeyOf, commentButtonKeyOf, inputKeyOf } from './diff/anchor'
import { addressedRow, commentBox, note, noteChip } from './diff/comment-box'
import { noteLinesOf } from './diff/note-layout'
import { docLinksOf, resolveDocLink } from './doc-links'
import { type DocSection, docSectionsOf } from './doc-sections'
import { baseName, iconOf } from './icons'
import { type DocBlock, docBlocksOf, markdownChunksOf, type TableBlock } from './markdown-chunks'
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

/** What the card's `│ ` left border takes of the pane's width. */
const BORDER_CELLS = 2
/** The calm colour of the card border and its `├─` separators. */
const BORDER_COLOR = COLORS.subtle
/** A note doc's title icon (a document), where a file's is its type icon. */
const NOTE_ICON = '\u{f0219}' // nf-md-file_document

/** More `│` rows than any pane is tall: the border column clips to the body's own height. */
const BORDER_STACK = Array.from({ length: 500 }, () => '│').join('\n')

const HEADING_LINE = /^ {0,3}#{1,6}\s/

/**
 * A section's text without its own heading line: the `├─ § heading` separator names the section,
 * so the Markdown must not draw it a second time.
 */
function withoutHeading(text: string): string {
  const [first = '', ...rest] = text.split('\n')
  return HEADING_LINE.test(first) ? rest.join('\n').trim() : text
}

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
  const tableRows = new WeakMap<TableBlock, { width: number; rows: DrawnLine[] }>()

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
      chunks: markdownChunksOf(withoutHeading(section.text)).map(chunk => ({
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

  /** A table block's drawn rows at `width`, laid out once per width, not every frame. */
  function tableRowsOf(block: TableBlock, width: number): DrawnLine[] {
    const cached = tableRows.get(block)
    if (cached && cached.width === width) return cached.rows
    const rows = drawnRowsOf(layoutTable(block, Math.max(1, width)))
    tableRows.set(block, { width, rows })
    return rows
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
            // One cell short of the pane, so a full-width line never loses its last cell.
            rows: tableRowsOf(block, kit.columns - 1),
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
   * ` ✎ note ` pill, right-aligned. A comment matching no section (its heading/index both gone)
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
    const { Box, Text } = kit.ui
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
          <Box key={`section-note:${anchorKeyOf(anchor)}`}>
            {ruleRow(kit, {
              color: BORDER_COLOR,
              start: '├─ ',
              left: (
                <Text wrap="truncate-end">
                  <Text color={BORDER_COLOR}>§ </Text>
                  <Text bold>{heading}</Text>
                </Text>
              ),
              right: chip
                ? pillRow(
                    kit,
                    [chip],
                    chipsFit([chip], Math.max(0, kit.columns - 8)),
                    `${anchorKeyOf(anchor)}:note`,
                  )
                : undefined,
            })}
          </Box>
          {chunkElementsOf(kit, sv.chunks, doc, `s${index}:`)}
          {addressed.length > 0 ? addressedRow(kit, anchor, addressed.length) : null}
          {visible.map(comment =>
            note(
              kit,
              comment,
              noteLinesOf(comment, kit.columns),
              now(),
              id => review.remove(id),
              review.resend,
            ),
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
            {ruleRow(kit, {
              color: BORDER_COLOR,
              start: '├─ ',
              left: <Text dimColor>Outdated</Text>,
            })}
            {[...outdatedGroups.entries()].map(([key, group]) => {
              const { addressed, visible } = splitAddressed(group)
              const anchor: Anchor = { path: doc.path, hunk: `§outdated:${key}` }
              return (
                <Box key={`outdated:${key}`} flexDirection="column">
                  {addressed.length > 0 ? addressedRow(kit, anchor, addressed.length) : null}
                  {visible.map(comment =>
                    note(
                      kit,
                      comment,
                      noteLinesOf(comment, kit.columns),
                      now(),
                      id => review.remove(id),
                      review.resend,
                    ),
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

    if (!shown) {
      return emptyState(
        kit,
        EMPTY_ICONS.doc,
        'Nothing shown yet — plans and docs Claude writes open here',
      )
    }

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

    // The card's `│ ` border takes two cells: everything inside lays out at the narrower width.
    const inner: Kit = { ...kit, columns: Math.max(1, kit.columns - BORDER_CELLS) }
    const icon =
      shown.doc.kind === 'file' ? iconOf(shown.doc.path) : { glyph: NOTE_ICON, color: RAINBOW.blue }
    const heading = (
      <Text wrap="truncate-end">
        <Text color={icon.color}>{icon.glyph}</Text>
        {shown.doc.kind === 'file' && shown.doc.title ? (
          <Text>
            <Text bold>{` ${shown.doc.title}`}</Text>
            <Text dimColor>{`  ${shown.doc.path}`}</Text>
          </Text>
        ) : (
          <Text bold>{` ${shown.doc.kind === 'file' ? shown.doc.path : shown.title}`}</Text>
        )}
      </Text>
    )

    return (
      <Box flexDirection="column">
        {picker}
        <Box key="doc-title">
          {ruleRow(kit, { color: BORDER_COLOR, start: '╭─ ', left: heading })}
        </Box>
        <Box key="doc-card" flexDirection="column" paddingLeft={BORDER_CELLS}>
          <Box position="absolute" top={0} bottom={0} left={0} width={1} overflow="hidden">
            <Text color={BORDER_COLOR}>{BORDER_STACK}</Text>
          </Box>
          {body(inner, shown)}
        </Box>
        <Box key="doc-close" flexDirection="row" overflow="hidden" flexWrap="nowrap">
          <Text color={BORDER_COLOR}>╰</Text>
          {fill(kit, BORDER_COLOR)}
        </Box>
      </Box>
    )
  }

  return { pane: DOC_PANE, subcommand: 'doc', render, show, reload }
}

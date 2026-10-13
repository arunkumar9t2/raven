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
import { fill } from '../ui/card'
import { EMPTY_ICONS, emptyState } from '../ui/empty'
import { ICON_GAP, iconText } from '../ui/icon-text'
import { pillRow } from '../ui/strip'
import { table } from '../ui/table'
import { widthOf } from '../ui/wrap'
import { type Anchor, anchorKeyOf, commentButtonKeyOf, inputKeyOf } from './diff/anchor'
import { addressedRow, commentBox, note, noteChip, outdatedHeading } from './diff/comment-box'
import { noteLinesOf } from './diff/note-layout'
import { HEADING_GAP, headingChipModeOf, headingLookOf, headingMarkCellsOf } from './doc-heading'
import { docLinksOf, resolveDocLink } from './doc-links'
import { TITLE_EDGE_CELLS, titlePathOf } from './doc-path'
import { type DocSection, docSectionsOf } from './doc-sections'
import { baseName, iconOf } from './icons'
import { type DocBlock, docBlocksOf, markdownChunksOf } from './markdown-chunks'
import { selectButtons } from './select-buttons'
import { createTableCache } from './table-cache'

/** A document the pane can show: a file read from disk, or markdown handed over inline. */
export type Doc =
  | { kind: 'file'; path: string; title?: string }
  | { kind: 'note'; markdown: string; title?: string }

/** `label` is what the title row prints for a file: its path relative to the session's directory when
 * inside it, else the path as given. */
type Shown = {
  key: string
  title: string
  label: string
  doc: Doc
  text: string | null
  error?: string
}

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

/** The calm colour of the dim rule under an H1/H2 heading. */
const RULE_COLOR = COLORS.subtle
/** Blank rows between the title row and a non-markdown body. */
const BODY_TOP = 1
/** A note doc's title icon (a document), where a file's is its type icon. */
const NOTE_ICON = '\u{f0219}' // nf-md-file_document

const HEADING_LINE = /^ {0,3}#{1,6}\s/

/**
 * A section's text without its own heading line: its heading is drawn by the section's own heading row,
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

/** `path` relative to `cwd` when it lies inside it; otherwise unchanged. */
export const labelOf = (path: string, cwd: string) =>
  path.startsWith(`${cwd}/`) ? path.slice(cwd.length + 1) : path

/** The anchor for a doc section's controls, keyed by the section's INDEX, not its heading. Two
 * sections sharing a heading never share controls. `hunk` only keys the controls; the comment
 * itself stores `section` (the heading) and `sectionIndex` (the index), never this string. */
const sectionAnchorOf = (path: string, index: number): Anchor => ({ path, hunk: `§${index}` })

/**
 * The title row: the file-type icon (a document icon for a note), a gap, the bold name, and (for a
 * file) the path dimmed, right-aligned and shortened from the left to what the name leaves. A file
 * with a caller title shows that title, one without shows its basename; a note shows its title.
 * The pane's last column stays free.
 */
function titleRow(kit: Kit, shown: Shown): RenderElement {
  const { Box, Text } = kit.ui
  const isFile = shown.doc.kind === 'file'
  const icon =
    shown.doc.kind === 'file' ? iconOf(shown.doc.path) : { glyph: NOTE_ICON, color: RAINBOW.blue }
  const name =
    shown.doc.kind === 'file' ? (shown.doc.title ?? baseName(shown.doc.path)) : shown.title
  const path = isFile
    ? titlePathOf(shown.label, kit.columns, widthOf(iconText(icon.glyph, name)))
    : ''
  return (
    <Box
      key="doc-title"
      flexDirection="row"
      overflow="hidden"
      flexWrap="nowrap"
      paddingRight={TITLE_EDGE_CELLS}
    >
      <Box flexShrink={1} overflow="hidden">
        <Text wrap="truncate-end">
          <Text color={icon.color}>{icon.glyph}</Text>
          <Text bold>{`${ICON_GAP}${name}`}</Text>
        </Text>
      </Box>
      <Box flexGrow={1} />
      {path === '' ? null : (
        <Box flexShrink={0}>
          <Text dimColor>{`  ${path}`}</Text>
        </Box>
      )}
    </Box>
  )
}

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
  const tables = createTableCache()

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

  /** `shown`'s sections, each pre-split into its own drawable chunks: commenting applies only
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

  // Whether the last render drew a `Client` strip: its note pill is then no keyed element to focus.
  let isClient = false

  function startComposing(anchor: Anchor) {
    composing = anchor
    host.redraw()
    actions.focus(inputKeyOf(anchor))
  }

  function stopComposing(anchor: Anchor) {
    composing = null
    host.redraw()
    if (!isClient) actions.focus(commentButtonKeyOf(anchor))
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

  /** The title row's path: relative to the session's directory, or the path itself when that is unknown. */
  async function fileLabelOf(path: string): Promise<string> {
    try {
      return labelOf(path, await host.cwd())
    } catch {
      return path
    }
  }

  async function show(doc: Doc) {
    const key = keyOf(doc)
    const label = doc.kind === 'file' ? await fileLabelOf(doc.path) : titleOf(doc)
    const shown: Shown = { key, title: titleOf(doc), label, doc, ...(await read(doc)) }
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

  /** One block as a drawn element: prose through `Markdown` (a file's with its pressable links,
   * following one to the doc it resolves to), code through `Code`, a table through Raven's own
   * grid; null for an empty fence (the engine may refuse the whole drawing on an empty `Code`). */
  function blockElementOf(
    kit: Kit,
    chunk: Chunk,
    block: DocBlock,
    doc: Doc,
    key: string,
  ): RenderElement | null {
    const { Code, Markdown } = kit.ui
    // R36: the engine sizes a table to the terminal, not the pane, so Raven draws it, fitted to
    // the pane's width. One cell short of it, so a full-width line never loses its last cell.
    if (block.kind === 'table') {
      return table(kit, { key, rows: tables.rowsOf(block, kit.columns - 1, kit.style) })
    }
    if (block.kind === 'code') {
      if (block.text === '') return null
      return <Code key={key} source={block.text} language={block.language} />
    }
    return doc.kind === 'file' ? (
      <Markdown
        key={key}
        text={block.text}
        pressableLinks={chunk.links}
        onLinkPress={link => {
          const target = resolveDocLink(doc.path, link.href)
          if (target) void show({ kind: 'file', path: target })
        }}
      />
    ) : (
      <Markdown key={key} text={block.text} />
    )
  }

  /**
   * The chunks' blocks in order, each in its own wrapper `<keyPrefix>b:<n>` with one blank row
   * above it except the first (`marginTop={1}`): Markdown, code and tables are separate elements,
   * so this is what puts a blank row between them.
   */
  function chunkElementsOf(
    kit: Kit,
    chunks: readonly Chunk[],
    doc: Doc,
    keyPrefix: string,
  ): RenderElement[] {
    const { Box } = kit.ui
    const out: RenderElement[] = []
    chunks.forEach((chunk, i) => {
      chunk.blocks.forEach((block, j) => {
        const element = blockElementOf(kit, chunk, block, doc, `${keyPrefix}${i}:${j}`)
        if (element === null) return
        out.push(
          <Box
            key={`${keyPrefix}b:${out.length}`}
            flexDirection="column"
            marginTop={out.length > 0 ? 1 : 0}
          >
            {element}
          </Box>,
        )
      })
    })
    return out
  }

  /**
   * A markdown file's body, per `docSectionsOf` section: a heading (the style's mark and accent
   * for H1/H2, a dim rule under it in the styles without a bar, bold only for H3+), the note chip
   * inline two cells after the heading text, a blank row above and below it, then the section's
   * blocks one blank row apart, then its notes (the doc's comments whose `section`/`sectionIndex`
   * match this section: a comment with no `sectionIndex` matches the first section with its
   * heading) and the compose box while composing. Addressed notes collapse to one dim
   * "✓ N addressed" row. A comment matching no section (its heading/index both gone) draws at the
   * end under a dim `Outdated` row instead of being dropped. Only comments carrying a `section`
   * ever draw here (the same discriminator `blocks.ts`'s orphan group uses), so a diff comment
   * (hunk- or file-level) on this same path, which carries none, stays out of the Doc pane
   * entirely and is left for the diff stream alone. There is no frame or rail: the pane's whole
   * width is the body's.
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
      // `notesBlocksOf` (`diff/blocks.ts`): one shared split (`splitAddressed`), one component
      // (`addressedRow`), so a section's notes read the same way wherever they draw.
      const { addressed, visible } = splitAddressed(notes)

      const look = headingLookOf(kit.style, sv.section.level)
      const markCells = headingMarkCellsOf(look)
      // Prose above the first heading has no heading to show: its row is only the note chip.
      const isTop = sv.section.level === 0
      const mode = chip
        ? headingChipModeOf(kit.columns, markCells, isTop ? 0 : widthOf(heading), chip)
        : 'words'
      const blocks = chunkElementsOf(kit, sv.chunks, doc, `s${index}:`)
      const hasNotes = addressed.length > 0 || visible.length > 0 || isComposing
      const hasBody = blocks.length > 0 || hasNotes

      return (
        <Box key={`section:${index}`} flexDirection="column">
          <Box
            key={`section-head:${index}`}
            flexDirection="column"
            marginTop={isTop && index === 0 ? 0 : 1}
            marginBottom={hasBody ? 1 : 0}
          >
            <Box
              key={`section-note:${anchorKeyOf(anchor)}`}
              flexDirection="row"
              overflow="hidden"
              flexWrap="nowrap"
              paddingRight={TITLE_EDGE_CELLS}
            >
              {isTop ? null : (
                <Box flexShrink={1} flexDirection="row" overflow="hidden" flexWrap="nowrap">
                  {look.mark ? <Text color={COLORS.accent}>{`${look.mark} `}</Text> : null}
                  <Box flexShrink={1} overflow="hidden">
                    <Text
                      wrap="truncate-end"
                      bold
                      dimColor={look.dim}
                      color={look.accent ? COLORS.accent : undefined}
                    >
                      {heading}
                    </Text>
                  </Box>
                </Box>
              )}
              {chip ? (
                <Box flexShrink={0} marginLeft={isTop ? 0 : HEADING_GAP}>
                  {pillRow(kit, [chip], mode, `${anchorKeyOf(anchor)}:note`)}
                </Box>
              ) : null}
            </Box>
            {look.rule ? (
              <Box flexDirection="row" height={1} overflow="hidden">
                {fill(kit, RULE_COLOR)}
              </Box>
            ) : null}
          </Box>
          {blocks}
          {hasNotes ? (
            <Box
              key={`section-notes:${index}`}
              flexDirection="column"
              marginTop={blocks.length > 0 ? 1 : 0}
            >
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
                    inputRows: 2,
                    line: null,
                    columns: kit.columns,
                    onLineChange: () => {},
                    onSubmit: submitted => submitComment(doc.path, heading, index, submitted),
                    onCancel: () => stopComposing(anchor),
                  })
                : null}
            </Box>
          ) : null}
        </Box>
      )
    })

    const outdated = comments.filter(comment => !matchedIds.has(comment.id))

    // Grouped by the section identity each comment still carries (its heading and the index it
    // was made at, even though neither names a section on screen any more); the same per-anchor
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
          <Box flexDirection="column" marginTop={1}>
            {outdatedHeading(kit)}
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
      if (!kit.capabilities.canShowImage || !isPng(path)) {
        return (
          <Box key="doc-body" flexDirection="column" marginTop={BODY_TOP}>
            <Text dimColor>{path}</Text>
          </Box>
        )
      }
      const columns = Math.max(1, Math.min(kit.columns, 60))
      const rows = Math.max(1, Math.round(columns / 2))
      return (
        <Box key="doc-body" flexDirection="column" marginTop={BODY_TOP}>
          <Image
            source={{ file: path, format: 'png' }}
            columns={columns}
            rows={rows}
            alt={baseName(path)}
          />
        </Box>
      )
    }
    if (shown.text === null) {
      return (
        <Box key="doc-body" flexDirection="column" marginTop={BODY_TOP}>
          <Text color={COLORS.error}>Could not read: {shown.error}</Text>
        </Box>
      )
    }
    // Commenting applies only to a file doc: a comment anchors to `doc.path`, which an inline
    // 'note' doc has none of; it keeps the plain, uncommentable rendering it always had.
    if (shown.doc.kind === 'file' && isMarkdown(shown.doc.path)) {
      return sectionsBody(kit, shown, shown.doc, shown.text)
    }
    if (shown.doc.kind === 'note') {
      return (
        <Box key="doc-body" flexDirection="column" marginTop={BODY_TOP}>
          {chunkElementsOf(kit, chunksOf(shown, shown.text), shown.doc, '')}
        </Box>
      )
    }
    const isCut = shown.text.length > ELEMENT_TEXT_LIMIT
    const source = shown.text.slice(0, ELEMENT_TEXT_LIMIT)
    return (
      <Box key="doc-body" flexDirection="column" marginTop={BODY_TOP}>
        <Code source={source} path={shown.doc.path} startLine={1} />
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
    const { Box, Select } = kit.ui
    isClient = kit.capabilities.canClient
    const shown = history.find(each => each.key === current)

    if (!shown) {
      return emptyState(
        kit,
        EMPTY_ICONS.doc,
        'Nothing shown yet. Plans and docs Claude writes open here',
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

    return (
      <Box flexDirection="column">
        {picker}
        {titleRow(kit, shown)}
        <Box key="doc-card" flexDirection="column">
          {body(kit, shown)}
        </Box>
      </Box>
    )
  }

  return { pane: DOC_PANE, subcommand: 'doc', render, show, reload }
}

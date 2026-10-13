/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../../core/colors'
import { ELEMENT_TEXT_LIMIT, type Kit } from '../../core/view'
import type { SideLine, SplitHunk, SplitRow } from './split'
import {
  codeTextOf,
  columnOf,
  piecesOf,
  plainOf,
  runsOf,
  sideCellOf,
  sideWidthsOf,
} from './split-layout'
import { type Seg, wordDiffOf } from './word-diff'

/**
 * Which side-by-side drawing is live, until the person picks one at checkpoint 4 and the others are
 * deleted: `A` a `Code` per side per run (syntax colours, a `▌` marker), `B` a `Text` per row on
 * the diff fills, `B2` B with the changed words on the word fills. The mod hot-reloads on save,
 * so changing this word is how a candidate is switched on screen.
 */
export type SplitRender = 'A' | 'B' | 'B2'
export const SPLIT_RENDER: SplitRender = 'A'

const REMOVED_MARKER = COLORS.removed
const ADDED_MARKER = COLORS.added

export type SplitHunkProps = {
  /** The element key of the whole hunk body. */
  key: string
  split: SplitHunk
  /** The window's visible rows: `split.rows.slice(from, to)` is what draws. */
  from: number
  to: number
  /** The room beside the card's rail, in columns. */
  width: number
  /** The file path, which picks `Code`'s language. */
  path: string
  render: SplitRender
}

const sourceOf = (lines: readonly SideLine[]): string =>
  lines.map(line => codeTextOf(line.text)).join('\n') || ' '

/** Candidate A: one side of a piece as a marker strip beside a `Code`; blank when that side has no lines. */
function codeSide(
  kit: Kit,
  path: string,
  piece: readonly SplitRow[],
  side: 'left' | 'right',
  width: number,
  kind: SplitRow['kind'],
): RenderElement {
  const { Box, Text, Code } = kit.ui
  const lines = piece.flatMap(row => {
    const line = row[side]
    return line ? [line] : []
  })
  const first = lines[0]
  if (!first) return <Box width={width} flexShrink={0} />

  const marker =
    kind === 'change' ? (
      <Text color={side === 'left' ? REMOVED_MARKER : ADDED_MARKER}>
        {columnOf('▌', lines.length)}
      </Text>
    ) : (
      <Box width={1} flexShrink={0} />
    )
  return (
    <Box width={width} flexShrink={0} flexDirection="row" overflow="hidden" flexWrap="nowrap">
      {marker}
      <Box flexGrow={1} overflow="hidden">
        <Code
          source={sourceOf(lines)}
          format="source"
          path={path}
          startLine={first.n}
          wrap="truncate-end"
        />
      </Box>
    </Box>
  )
}

/** Candidates B and B2: one side of a row as a filled `Text`; blank when that side has no line. */
function textSide(
  kit: Kit,
  line: SideLine | null,
  gutter: number,
  width: number,
  segs?: readonly Seg[],
): RenderElement {
  const { Box, Text } = kit.ui
  if (!line) return <Box width={width} flexShrink={0} />

  const cell = sideCellOf(line, gutter, width, segs)
  const fill =
    line.mark === '+' ? COLORS.lineAdded : line.mark === '-' ? COLORS.lineRemoved : undefined
  const wordFill = line.mark === '+' ? COLORS.added : COLORS.removed
  return (
    // The Box carries the fill too, so a 2-cell character cut at the edge leaves no bare cell.
    <Box width={width} flexShrink={0} overflow="hidden" backgroundColor={fill}>
      <Text backgroundColor={fill} wrap="truncate-end">
        <Text dimColor backgroundColor={fill}>
          {cell.prefix}
        </Text>
        {cell.segs.map((seg, index) => (
          <Text key={`s${index}`} backgroundColor={seg.changed ? wordFill : fill}>
            {seg.text}
          </Text>
        ))}
        <Text backgroundColor={fill}>{cell.pad}</Text>
      </Text>
    </Box>
  )
}

/** A truncation marker: one dim line across the whole body, not a numbered row. */
function markerRow(kit: Kit, row: SplitRow, width: number): RenderElement {
  const { Box, Text } = kit.ui
  return (
    <Box width={width} flexShrink={0} overflow="hidden">
      <Text dimColor wrap="truncate-end">
        {plainOf(row.text ?? '')}
      </Text>
    </Box>
  )
}

/**
 * The visible rows of a side-by-side hunk body: `props.split.rows.slice(from, to)`, drawn in the
 * candidate `props.render` names. One terminal row per `SplitRow`, so the window's row accounting
 * (`rowsOf` of a split hunk block) holds; every line truncates rather than wraps.
 */
export function splitHunk(kit: Kit, props: SplitHunkProps): RenderElement {
  const { Box, Text } = kit.ui
  const rows = props.split.rows.slice(props.from, props.to)
  const widths = sideWidthsOf(props.width)

  if (props.render === 'A') {
    const pieces = runsOf(rows).flatMap(run =>
      run.kind === 'marker'
        ? [{ kind: run.kind, start: run.from, rows: rows.slice(run.from, run.to) }]
        : piecesOf(rows.slice(run.from, run.to), ELEMENT_TEXT_LIMIT).map(([from, to]) => ({
            kind: run.kind,
            start: run.from + from,
            rows: rows.slice(run.from + from, run.from + to),
          })),
    )
    return (
      <Box key={props.key} flexDirection="column" overflow="hidden">
        {pieces.map(piece =>
          piece.kind === 'marker' ? (
            <Box key={`run:${props.from + piece.start}`} flexDirection="column" overflow="hidden">
              {piece.rows.map(row => markerRow(kit, row, props.width))}
            </Box>
          ) : (
            <Box
              key={`run:${props.from + piece.start}`}
              flexDirection="row"
              overflow="hidden"
              flexWrap="nowrap"
            >
              {codeSide(kit, props.path, piece.rows, 'left', widths.left, piece.kind)}
              <Text dimColor>{columnOf('│', piece.rows.length)}</Text>
              {codeSide(kit, props.path, piece.rows, 'right', widths.right, piece.kind)}
            </Box>
          ),
        )}
      </Box>
    )
  }

  const withWords = props.render === 'B2'
  return (
    <Box key={props.key} flexDirection="column" overflow="hidden">
      {rows.map((row, index) => {
        if (row.kind === 'marker') {
          return <Box key={`row:${props.from + index}`}>{markerRow(kit, row, props.width)}</Box>
        }
        const words =
          withWords && row.left && row.right
            ? wordDiffOf(plainOf(row.left.text), plainOf(row.right.text))
            : null
        return (
          <Box
            key={`row:${props.from + index}`}
            flexDirection="row"
            overflow="hidden"
            flexWrap="nowrap"
          >
            {textSide(kit, row.left, props.split.gutter, widths.left, words?.left)}
            <Text dimColor>│</Text>
            {textSide(kit, row.right, props.split.gutter, widths.right, words?.right)}
          </Box>
        )
      })}
    </Box>
  )
}

/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../../core/colors'
import type { Kit } from '../../core/view'
import type { SideLine, SplitHunk, SplitRow } from './split'
import { plainOf, sideCellOf, sideWidthsOf } from './split-layout'
import { type Seg, wordDiffOf } from './word-diff'

export type SplitHunkProps = {
  /** The element key of the whole hunk body. */
  key: string
  split: SplitHunk
  /** The window's visible rows: `split.rows.slice(from, to)` is what draws. */
  from: number
  to: number
  /** The room beside the card's rail, in columns. */
  width: number
}

/** One side of a row as a filled `Text`, changed words on the word fill; blank when that side has no line. */
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
function markerRow(kit: Kit, row: SplitRow, width: number, key: string): RenderElement {
  const { Box, Text } = kit.ui
  return (
    <Box key={key} width={width} flexShrink={0} overflow="hidden">
      <Text dimColor wrap="truncate-end">
        {plainOf(row.text ?? '')}
      </Text>
    </Box>
  )
}

/**
 * The visible rows of a side-by-side hunk body: `props.split.rows.slice(from, to)`, each a `Text`
 * per side on the diff fills, a paired row's changed words on the brighter word fills. One terminal
 * row per `SplitRow`, so the window's row accounting (`rowsOf` of a split hunk block) holds; every
 * line truncates rather than wraps.
 */
export function splitHunk(kit: Kit, props: SplitHunkProps): RenderElement {
  const { Box, Text } = kit.ui
  const rows = props.split.rows.slice(props.from, props.to)
  const widths = sideWidthsOf(props.width)

  return (
    <Box key={props.key} flexDirection="column" overflow="hidden">
      {rows.map((row, index) => {
        if (row.kind === 'marker') {
          return markerRow(kit, row, props.width, `row:${props.from + index}`)
        }
        const words =
          row.left && row.right ? wordDiffOf(plainOf(row.left.text), plainOf(row.right.text)) : null
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

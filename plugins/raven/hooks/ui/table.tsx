/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../core/colors'
import type { UiKit } from '../core/view'
import { drawnRowsOf, layoutTable, type Piece, type TableData } from './table-layout'

export type TableProps = TableData & {
  /** Cells the table may fill: the pane's content width. */
  width: number
  key?: string
  /** One blank row above / below, to breathe like a `Markdown` block. */
  gapTop?: boolean
  gapBottom?: boolean
}

/**
 * A GFM table drawn by Raven, fitted to `width` (the engine's `Markdown` sizes tables to the
 * terminal, not the pane). Dim box borders, centred bold header, body cells aligned per the
 * delimiter row, `code` spans in the accent-ish `suggestion` colour. One `Text` line per drawn row,
 * truncated rather than ever wrapped — the layout already guarantees each line fits `width`.
 */
export function table(kit: UiKit, props: TableProps): RenderElement {
  const { Box, Text } = kit.ui
  const layout = layoutTable(props, Math.max(1, props.width))
  const span = (piece: Piece, index: number) => {
    if (piece.style === 'border')
      return (
        <Text key={`p${index}`} dimColor>
          {piece.text}
        </Text>
      )
    if (piece.style === 'bold')
      return (
        <Text key={`p${index}`} bold>
          {piece.text}
        </Text>
      )
    if (piece.style === 'code')
      return (
        <Text key={`p${index}`} color={COLORS.suggestion}>
          {piece.text}
        </Text>
      )
    return <Text key={`p${index}`}>{piece.text}</Text>
  }
  return (
    <Box
      key={props.key}
      flexDirection="column"
      marginTop={props.gapTop ? 1 : 0}
      marginBottom={props.gapBottom ? 1 : 0}
    >
      {drawnRowsOf(layout).map((line, index) => (
        <Text key={`p${index}`} wrap="truncate-end">
          {line.length === 0 ? ' ' : line.map(span)}
        </Text>
      ))}
    </Box>
  )
}

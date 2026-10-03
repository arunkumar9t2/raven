/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../core/colors'
import type { UiKit } from '../core/view'
import type { DrawnLine, Piece, PieceStyle } from './table-layout'

export type TableProps = {
  /** The drawn rows (`drawnRowsOf(layoutTable(data, width))`), laid out once by the caller. */
  rows: readonly DrawnLine[]
  key?: string
  /** One blank row above / below, to breathe like a `Markdown` block. */
  gapTop?: boolean
  gapBottom?: boolean
}

/** How each piece style draws. */
const PROPS: Record<PieceStyle, { dimColor?: true; bold?: true; color?: string }> = {
  border: { dimColor: true },
  bold: { bold: true },
  code: { color: COLORS.suggestion },
  plain: {},
}

/**
 * A GFM table drawn by Raven from rows already fitted to the pane (the engine's `Markdown` sizes
 * tables to the terminal, not the pane). Dim box borders, centred bold header, body cells aligned
 * per the delimiter row, `code` spans in the accent-ish `suggestion` colour. One `Text` line per
 * drawn row, truncated rather than ever wrapped — the layout already guarantees each line fits.
 */
export function table(kit: UiKit, props: TableProps): RenderElement {
  const { Box, Text } = kit.ui
  const span = (piece: Piece, index: number) => (
    <Text key={`p${index}`} {...PROPS[piece.style]}>
      {piece.text}
    </Text>
  )
  return (
    <Box
      key={props.key}
      flexDirection="column"
      marginTop={props.gapTop ? 1 : 0}
      marginBottom={props.gapBottom ? 1 : 0}
    >
      {props.rows.map((line, index) => (
        <Text key={`p${index}`} wrap="truncate-end">
          {line.length === 0 ? ' ' : line.map(span)}
        </Text>
      ))}
    </Box>
  )
}

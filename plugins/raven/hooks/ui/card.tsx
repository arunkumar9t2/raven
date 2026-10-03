/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../core/colors'
import type { UiKit } from '../core/view'

/** The card's left edge: the `┃` bar and the one-cell gap after it. */
export const CARD_BAR_CELLS = 2

/** A `┃` per row, one under another. */
const barOf = (rows: number): string =>
  Array.from({ length: Math.max(1, rows) }, () => '┃').join('\n')

export type CardProps = {
  /** The bar's colour. */
  color: string
  /** Rows the bar spans: the card's own row count. */
  rows: number
  children: RenderElement | RenderElement[]
}

/**
 * The person's own words: a heavy `┃` in `color` down `rows` rows, then the content, all on the
 * user-message tint from the bar to the right edge — a note and the compose box alike.
 */
export function card(kit: UiKit, props: CardProps): RenderElement {
  const { Box, Text } = kit.ui
  return (
    <Box
      flexDirection="row"
      flexGrow={1}
      gap={1}
      overflow="hidden"
      flexWrap="nowrap"
      backgroundColor={COLORS.userMessage}
    >
      <Text color={props.color}>{barOf(props.rows)}</Text>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {props.children}
      </Box>
    </Box>
  )
}

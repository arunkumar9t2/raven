/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../core/view'

export type RowProps = {
  left: RenderElement | string
  right?: RenderElement | string
  /** Makes the row a hover scope; required for `hover` to apply. */
  key?: string
  /** Style overrides the surface applies while the pointer rests on this row's `key`. */
  hover?: { backgroundColor: string }
}

/** A space-between row: left truncates first, nowrap; a keyed row can light on hover. */
export function row(kit: Kit, props: RowProps): RenderElement {
  const { Box, Text } = kit.ui
  const { left, right, key, hover } = props

  return (
    <Box
      key={key}
      flexDirection="row"
      justifyContent="space-between"
      gap={1}
      overflow="hidden"
      flexWrap="nowrap"
      hover={hover}
    >
      <Text wrap="truncate-end">{left}</Text>
      {right !== undefined ? <Text dimColor>{right}</Text> : ''}
    </Box>
  )
}

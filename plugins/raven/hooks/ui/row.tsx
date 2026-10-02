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

/**
 * A string slot truncates in a `Text`; an element slot (a `chipRow`, a `progressBar` — each a
 * `Box`) draws bare in a shrinking, clipping `Box` instead — the engine refuses a `Box` nested
 * inside an inline `Text`.
 */
function slotOf(kit: Kit, value: RenderElement | string, dim: boolean): RenderElement {
  const { Box, Text } = kit.ui
  if (typeof value === 'string') {
    return (
      <Text dimColor={dim} wrap="truncate-end">
        {value}
      </Text>
    )
  }
  return (
    <Box flexShrink={1} overflow="hidden">
      {value}
    </Box>
  )
}

/** A space-between row: left truncates first, nowrap; a keyed row can light on hover. */
export function row(kit: Kit, props: RowProps): RenderElement {
  const { Box } = kit.ui
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
      {slotOf(kit, left, false)}
      {right !== undefined ? slotOf(kit, right, true) : ''}
    </Box>
  )
}

/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { UiKit } from '../core/view'

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
function slotOf(kit: UiKit, value: RenderElement | string, dim: boolean): RenderElement {
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

/**
 * A space-between row: left truncates first, nowrap; a keyed row can light on hover.
 *
 * `flexGrow={1}`: a row-direction parent (as every caller's wrapping rail/indent Box is, see
 * `diff-view.tsx`'s `placedRowOf`/`bodyRowOf`) sizes a flex child to its own content on the main
 * axis unless the child claims a share of the growth itself — only a column parent's default
 * `alignItems: stretch` would have filled the width for free, and nothing here is one. Without
 * this, `justifyContent="space-between"` has no free width to distribute and the right slot sits
 * right after the left instead of at the row's far edge (confirmed live: `+1 −1 [ ✎ note ]` with
 * no gap at all).
 */
export function row(kit: UiKit, props: RowProps): RenderElement {
  const { Box } = kit.ui
  const { left, right, key, hover } = props

  return (
    <Box
      key={key}
      flexDirection="row"
      flexGrow={1}
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

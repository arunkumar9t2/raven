/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../core/view'

/** A bold count, coloured — a file count, a pending-comment count. */
export function badge(kit: Kit, n: number, color: string): RenderElement {
  const { Text } = kit.ui
  return (
    <Text color={color} bold>
      {n}
    </Text>
  )
}

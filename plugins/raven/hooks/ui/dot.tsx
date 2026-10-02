/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../core/view'

/** A coloured `●` — a status or category marker, as RemCTL's category dots. */
export function dot(kit: Kit, color: string): RenderElement {
  const { Text } = kit.ui
  return <Text color={color}>●</Text>
}

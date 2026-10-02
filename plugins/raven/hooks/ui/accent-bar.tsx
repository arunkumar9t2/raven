/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../core/view'

/** `▎` — a note's left edge, coloured by its state (see `NOTE_STATE_COLORS`). */
export function accentBar(kit: Kit, color: string): RenderElement {
  const { Text } = kit.ui
  return <Text color={color}>▎</Text>
}

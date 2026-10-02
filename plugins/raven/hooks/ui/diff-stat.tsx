/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../core/colors'
import type { Kit } from '../core/view'

/** `+N −M` in the diff's word colours; a zero side is left out (as the official diff mod's). */
export function diffStat(kit: Kit, added: number, removed: number): RenderElement {
  const { Text } = kit.ui
  const hasBoth = added > 0 && removed > 0

  return (
    <Text>
      {added > 0 ? <Text color={COLORS.added}>{`+${added}`}</Text> : ''}
      {hasBoth ? ' ' : ''}
      {removed > 0 ? <Text color={COLORS.removed}>{`−${removed}`}</Text> : ''}
    </Text>
  )
}

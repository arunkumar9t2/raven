/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { UiKit } from '../../core/view'

/**
 * The 2-column left border of a file's card, `│ ` in `color`, one per row down a block of `rows`
 * rows. A `mark` colour turns the last row's cell into `◆ ` — the line a note hangs under.
 */
export function railOf(kit: UiKit, rows: number, color: string, mark?: string): RenderElement {
  const { Text } = kit.ui
  const above = '│ \n'.repeat(Math.max(0, rows - 1))
  if (mark === undefined) return <Text color={color}>{`${above}│ `}</Text>
  return (
    <Text color={color}>
      {above}
      <Text color={mark}>◆ </Text>
    </Text>
  )
}

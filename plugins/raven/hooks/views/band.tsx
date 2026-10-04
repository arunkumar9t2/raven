/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'
import { COLORS } from '../core/colors'
import { countOf } from '../core/format'
import type { Kit } from '../core/view'
import { NAME } from '../names'
import { type Chip, chipsLayout } from '../ui/chips'
import { dot } from '../ui/dot'
import { pillRow } from '../ui/strip'

/** What the `AbovePrompt` band has to say: pending review comments, an unseen doc, or both. */
export type BandProps = {
  pendingCount: number
  isDocUpdated: boolean
}

export type BandActions = {
  /** Brings the relevant pane forward: the diff when comments are pending, else the doc. */
  open: () => void
  send: () => void
}

/**
 * One row above the prompt, D9/D10's kit applied: `● raven  2 notes pending · plan updated
 *  open   ➤ send ` — the accent dot and name on the left, the notes/plan summary beside it,
 * then the controls as pills on the right, `send` the one primary action. `chipsLayout` shrinks
 * `open` before `send` keeps its words, same priority rule as the diff header's own chips.
 */
export function band(kit: Kit, state: BandProps, actions: BandActions) {
  const { Box, Text } = kit.ui
  const parts = [
    state.pendingCount > 0 ? `${countOf(state.pendingCount, 'note')} pending` : null,
    state.isDocUpdated ? 'plan updated' : null,
  ].filter((part): part is string => part !== null)

  const chips: Chip[] = [
    { key: 'band:open', icon: '', label: 'open', priority: 0, onPress: actions.open },
  ]
  if (state.pendingCount > 0) {
    chips.push({
      key: 'band:send',
      icon: '➤',
      label: 'send',
      kind: 'primary',
      priority: 1,
      onPress: actions.send,
    })
  }
  const modes = chipsLayout(chips, Math.max(0, kit.columns - NAME.length - 4))

  return (
    <Box
      flexDirection="row"
      gap={2}
      justifyContent="space-between"
      overflow="hidden"
      flexWrap="nowrap"
    >
      <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
        {dot(kit, COLORS.accent)}
        <Text wrap="truncate-end">
          {NAME}
          {parts.length > 0 ? `  ${parts.join(' · ')}` : ''}
        </Text>
      </Box>
      <Box flexShrink={0}>{pillRow(kit, chips, modes, 'band')}</Box>
    </Box>
  )
}

/** The `/raven` command's output row: its reply text, unchanged, behind a leading glyph. */
export function commandOutputRow(
  kit: Pick<Kit, 'ui'>,
  props: { glyph: string; text: string; isErrored: boolean },
): RenderElement {
  const { Text } = kit.ui
  return (
    <Text color={props.isErrored ? COLORS.error : undefined} wrap="truncate-end">
      {props.glyph} {props.text}
    </Text>
  )
}

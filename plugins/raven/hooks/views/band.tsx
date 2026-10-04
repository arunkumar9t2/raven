/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'
import { COLORS } from '../core/colors'
import type { Kit } from '../core/view'
import { type Chip, chipsLayout } from '../ui/chips'
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

/** Columns the engine keeps at the band's right edge (it draws its own marker there): the row stays clear of them. */
const BAND_GUTTER = 3

/** The band's mark: a bird (nf-md-bird) in the accent. */
export const BAND_MARK = '\u{f15c6}'

/**
 * One row above the prompt: `<mark> ✎ 2 pending · plan updated   open   ➤ send` — the accent Raven
 * mark, the notes summary in the suggestion colour (the plan flag dim), then the controls as
 * pills on the right, `send` the one primary action. No brackets, one row. `chipsLayout` shrinks
 * `open` before `send` keeps its words, same priority rule as the diff header's own chips.
 */
export function band(kit: Kit, state: BandProps, actions: BandActions) {
  const { Box, Text } = kit.ui

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
  const modes = chipsLayout(chips, Math.max(0, kit.columns - 24))

  return (
    <Box
      flexDirection="row"
      width={Math.max(1, kit.columns - BAND_GUTTER)}
      gap={2}
      justifyContent="space-between"
      overflow="hidden"
      flexWrap="nowrap"
    >
      <Text wrap="truncate-end">
        <Text color={COLORS.accent}>{BAND_MARK}</Text>
        {state.pendingCount > 0 ? (
          <Text color={COLORS.suggestion}>{` ✎ ${state.pendingCount} pending`}</Text>
        ) : (
          ''
        )}
        {state.isDocUpdated ? <Text dimColor>{`  plan updated`}</Text> : ''}
      </Text>
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

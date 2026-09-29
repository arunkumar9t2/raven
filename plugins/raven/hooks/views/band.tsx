/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'
import { countOf } from '../core/format'
import type { Kit } from '../core/view'
import { NAME } from '../names'

/** What the `AbovePrompt` band has to say: pending review comments, an unseen doc, or both. */
export type BandState = {
  pendingCount: number
  isDocUpdated: boolean
}

export type BandActions = {
  /** Brings the relevant pane forward: the diff when comments are pending, else the doc. */
  open: () => void
  send: () => void
}

/** One row above the prompt: `raven · N comments pending · plan updated`, plain `open`/`send`. */
export function band(kit: Pick<Kit, 'ui' | 'columns'>, state: BandState, actions: BandActions) {
  const { Box, Text, Button } = kit.ui
  const parts = [
    NAME,
    state.pendingCount > 0 ? `${countOf(state.pendingCount, 'comment')} pending` : null,
    state.isDocUpdated ? 'plan updated' : null,
  ].filter((part): part is string => part !== null)

  return (
    <Box flexDirection="row" gap={2} overflow="hidden" flexWrap="nowrap">
      <Text wrap="truncate-end">{parts.join(' · ')}</Text>
      <Button key="band:open" plain dimColor label="open" onPress={actions.open} />
      {state.pendingCount > 0 ? (
        <Button key="band:send" plain dimColor label="send" onPress={actions.send} />
      ) : null}
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
    <Text color={props.isErrored ? 'red' : undefined} wrap="truncate-end">
      {props.glyph} {props.text}
    </Text>
  )
}

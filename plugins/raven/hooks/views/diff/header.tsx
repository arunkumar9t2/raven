/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement, SelectOption } from 'claude-code'

import { COLORS } from '../../core/colors'
import { countOf } from '../../core/format'
import type { Kit } from '../../core/view'
import type { ChangedFile } from '../../git/changes'
import { selectButtons } from '../select-buttons'

/** The source Select's element key, for a test or a focus target. */
export const SOURCE_SELECT_KEY = 'source'

export type HeaderProps = {
  files: readonly ChangedFile[]
  pending: number
  confirmingClear: boolean
  sourceValue: string
  sourceOptions: readonly SelectOption[]
  onSourceChange: (value: string) => void
  onRefresh: () => void
  onSend: () => void
  onEditSend: () => void
  onPrevious: () => void
  onNext: () => void
  onClear: () => void
}

// Mirrors diff/source.ts's turnValueOf prefix; a turn has no name to put on a button, so the
// button row omits turns and offers HEAD/session/branch point only.
const TURN_PREFIX = 'turn:'

/** The source options as a row of plain buttons, for a surface with no `Select`. */
function sourceButtons(kit: Kit, props: HeaderProps): RenderElement {
  return selectButtons(kit, {
    key: 'source',
    options: props.sourceOptions.filter(option => !option.value.startsWith(TURN_PREFIX)),
    value: props.sourceValue,
    onSelect: props.onSourceChange,
  })
}

/**
 * Two fixed rows, neither ever wraps: counts and the source picker (a Select, or plain buttons
 * where the surface has none) on top, file navigation, refresh, clear and the send-to-Claude
 * button (plus "edit & send" once pending) below. `j`/`k` walk the file list, `r` refreshes, `s`
 * sends, each only while the pane holds the keyboard.
 */
export function header(kit: Kit, props: HeaderProps): RenderElement {
  const { Box, Text, Button, Select } = kit.ui
  const { files, pending } = props
  const adds = files.reduce((sum, file) => sum + file.adds, 0)
  const dels = files.reduce((sum, file) => sum + file.dels, 0)

  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={2} overflow="hidden" flexWrap="nowrap">
        <Text bold wrap="truncate-end">
          {countOf(files.length, 'file')}
        </Text>
        <Text color={COLORS.added} wrap="truncate-end">
          +{adds}
        </Text>
        <Text color={COLORS.removed} wrap="truncate-end">
          −{dels}
        </Text>
        {Select ? (
          <Select
            key={SOURCE_SELECT_KEY}
            label="source"
            options={props.sourceOptions}
            value={props.sourceValue}
            onSelect={props.onSourceChange}
          />
        ) : (
          sourceButtons(kit, props)
        )}
      </Box>
      <Box flexDirection="row" gap={2} overflow="hidden" flexWrap="nowrap">
        <Button key="previous" plain dimColor hotkey="k" label="↑" onPress={props.onPrevious} />
        <Button key="next" plain dimColor hotkey="j" label="↓" onPress={props.onNext} />
        <Button
          key="refresh"
          plain
          dimColor
          hotkey="r"
          label="↻ refresh"
          onPress={props.onRefresh}
        />
        <Button
          key="clear"
          plain
          dimColor
          label={props.confirmingClear ? 'clear all? (again)' : 'clear'}
          onPress={props.onClear}
        />
        {/* Two siblings, not one <>…</> Fragment: a Fragment child draws as its own box here and
            forces this row onto two lines even when everything would otherwise fit on one. */}
        {pending > 0 ? (
          <Button key="edit-send" plain dimColor label="edit & send" onPress={props.onEditSend} />
        ) : null}
        {pending > 0 ? (
          <Button key="send" hotkey="s" label={`send ${pending}`} onPress={props.onSend} />
        ) : null}
      </Box>
    </Box>
  )
}

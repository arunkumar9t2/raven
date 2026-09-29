/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement, SelectOption } from 'claude-code'

import type { Kit } from '../../core/view'
import type { ChangedFile } from '../../git/changes'

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

/**
 * The top row: file/add/del counts, the source picker, file navigation, refresh, clear, and the
 * send-to-Claude button, plus "edit & send" once there is something pending. `j`/`k` walk the file
 * list, `r` refreshes, `s` sends, each only while the pane holds the keyboard.
 */
export function header(kit: Kit, props: HeaderProps): RenderElement {
  const { Box, Text, Button, Select } = kit.ui
  const { files, pending } = props
  const adds = files.reduce((sum, file) => sum + file.adds, 0)
  const dels = files.reduce((sum, file) => sum + file.dels, 0)

  return (
    <Box flexDirection="row" gap={2}>
      <Text bold>
        {files.length} {files.length === 1 ? 'file' : 'files'}
      </Text>
      <Text color="green">+{adds}</Text>
      <Text color="red">−{dels}</Text>
      <Select
        key={SOURCE_SELECT_KEY}
        label="source"
        options={props.sourceOptions}
        value={props.sourceValue}
        onSelect={props.onSourceChange}
      />
      <Button key="previous" plain dimColor hotkey="k" label="↑" onPress={props.onPrevious} />
      <Button key="next" plain dimColor hotkey="j" label="↓" onPress={props.onNext} />
      <Button key="refresh" plain dimColor hotkey="r" label="↻ refresh" onPress={props.onRefresh} />
      <Button
        key="clear"
        plain
        dimColor
        label={props.confirmingClear ? 'clear all? (again)' : 'clear'}
        onPress={props.onClear}
      />
      {pending > 0 ? (
        <>
          <Button key="edit-send" plain dimColor label="edit & send" onPress={props.onEditSend} />
          <Button
            key="send"
            hotkey="s"
            label={`Send ${pending} ${pending === 1 ? 'comment' : 'comments'} to Claude`}
            onPress={props.onSend}
          />
        </>
      ) : null}
    </Box>
  )
}

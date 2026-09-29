/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../../core/view'
import type { ChangedFile } from '../../git/changes'

export type HeaderProps = {
  files: readonly ChangedFile[]
  pending: number
  onRefresh: () => void
  onSend: () => void
}

/** The top row: file/add/del counts, the refresh button, and the send-to-Claude button. */
export function header(kit: Kit, props: HeaderProps): RenderElement {
  const { Box, Text, Button } = kit.ui
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
      <Button key="refresh" plain dimColor label="↻ refresh" onPress={props.onRefresh} />
      {pending > 0 ? (
        <Button
          key="send"
          label={`Send ${pending} ${pending === 1 ? 'comment' : 'comments'} to Claude`}
          onPress={props.onSend}
        />
      ) : null}
    </Box>
  )
}

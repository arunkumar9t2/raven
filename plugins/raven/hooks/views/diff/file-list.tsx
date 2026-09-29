/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../../core/view'
import type { ChangedFile } from '../../git/changes'
import { iconOf, statusMarkOf } from '../icons'

export type FileListProps = {
  files: readonly ChangedFile[]
  selected: string | null
  onSelect: (path: string) => void
}

/** The changed-files list: one row per file, with status/kind marks and an add/del count. */
export function fileList(kit: Kit, props: FileListProps): RenderElement {
  const { Box } = kit.ui
  return <Box flexDirection="column">{props.files.map(file => fileRow(kit, file, props))}</Box>
}

function fileRow(kit: Kit, file: ChangedFile, props: FileListProps): RenderElement {
  const { Box, Text, Button } = kit.ui
  const icon = iconOf(file.path)
  const mark = statusMarkOf(file.status)
  const isSelected = file.path === props.selected

  return (
    <Box key={`row:${file.path}`} flexDirection="row" gap={1}>
      <Text color={mark.color}>
        {isSelected ? '❯' : ' '} {mark.glyph}
      </Text>
      <Text color={icon.color}>{icon.glyph}</Text>
      <Button
        key={`file:${file.path}`}
        plain
        label={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        onPress={() => props.onSelect(file.path)}
      />
      <Text color="green">+{file.adds}</Text>
      <Text color="red">−{file.dels}</Text>
    </Box>
  )
}

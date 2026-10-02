/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../../core/colors'
import type { Kit } from '../../core/view'
import type { ChangedFile } from '../../git/changes'
import { diffStat } from '../../ui/diff-stat'
import { dot } from '../../ui/dot'
import { row } from '../../ui/row'
import { statBar } from '../../ui/stat-bar'
import { iconOf, statusMarkOf } from '../icons'
import { fileWindowOf } from './layout'

export type FileListProps = {
  files: readonly ChangedFile[]
  selected: string | null
  /** Paths edited this turn; a row among them draws `●` so the live feed stands out. */
  edited: ReadonlySet<string>
  onSelect: (path: string) => void
}

/** The list's row cap; `diff-view.tsx` imports it to size the fixed rows above the scrolling body. */
export const MAX_ROWS = 8

/**
 * The changed-files list: one row per file, with status/kind marks and an add/del count, capped
 * at `MAX_ROWS`; beyond that, the rows around the selected file plus a dim "… N more" row.
 */
export function fileList(kit: Kit, props: FileListProps): RenderElement {
  const { Box, Text } = kit.ui
  const { files, selected } = props
  const selectedIndex = files.findIndex(file => file.path === selected)
  const { start, end, more } = fileWindowOf(files.length, selectedIndex, MAX_ROWS)

  return (
    <Box flexDirection="column">
      {files.slice(start, end).map(file => fileRow(kit, file, props))}
      {more > 0 ? (
        <Text key="file-list:more" dimColor>
          … {more} more
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * A row: `❯ ● M <icon> path   +a −d ■■□  ◉` — a status dot and letter mark on the left beside
 * the icon and path, the add/del count and `statBar` right-aligned via `row`, with a trailing
 * `◉` in the accent when this file was edited this turn. Spelled out as its own glyph rather
 * than reusing the status dot's `●` — a status dot draws on every row regardless of status, so
 * the two must read as different marks for a glance to tell "what kind of change" from "is this
 * happening right now" apart.
 */
function fileRow(kit: Kit, file: ChangedFile, props: FileListProps): RenderElement {
  const { Box, Text, Button } = kit.ui
  const icon = iconOf(file.path)
  const mark = statusMarkOf(file.status)
  const isSelected = file.path === props.selected
  const isEdited = props.edited.has(file.path)

  const left = (
    <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
      <Text color={mark.color}>{isSelected ? '❯' : ' '}</Text>
      {dot(kit, mark.color)}
      <Text color={mark.color}>{mark.glyph}</Text>
      <Text color={icon.color}>{icon.glyph}</Text>
      <Button
        key={`file:${file.path}`}
        plain
        label={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        onPress={() => props.onSelect(file.path)}
      />
    </Box>
  )
  const right = (
    <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
      {diffStat(kit, file.adds, file.dels)}
      {statBar(kit, file.adds, file.dels)}
      {isEdited ? <Text color={COLORS.accent}>◉</Text> : null}
    </Box>
  )

  return row(kit, { left, right, key: `row:${file.path}` })
}

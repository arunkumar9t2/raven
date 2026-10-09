/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../../core/colors'
import type { Kit } from '../../core/view'
import type { ChangedFile } from '../../git/changes'
import { statBarCells } from '../../ui/stat-bar'
import { gap, type KitRow, type KitSeg, strip } from '../../ui/strip'
import { iconOf, statusMarkOf, statusSegs } from '../icons'
import { fileWindowOf } from './layout'

export type FileListProps = {
  files: readonly ChangedFile[]
  selected: string | null
  /** Paths edited this turn; a row among them draws `◉` so the live feed stands out. */
  edited: ReadonlySet<string>
  onSelect: (path: string) => void
}

/** The list's row cap; `diff-view.tsx` imports it to size the fixed rows above the scrolling body. */
export const MAX_ROWS = 8

/** The press id (and the fallback Button's key) of a file's row. */
export const fileRowIdOf = (path: string) => `file:${path}`

/**
 * The changed-files list: one row per file, with status/kind marks and an add/del count, capped
 * at `MAX_ROWS`; beyond that, the rows around the selected file plus a dim "… N more" row. Each
 * row's `statBar` scales against the largest change in the whole list (not just the visible
 * window), mirroring `changeMapOf`'s own scaling, so a tiny rename and a big edit read apart.
 * The rows are one `strip` (`ui/strip.tsx`): a Client where the surface has one (hover on the
 * user-message tint, the selected file's row on the selection tint, a click anywhere on a row
 * selects it), plain Buttons on the path elsewhere.
 */
export function fileList(kit: Kit, props: FileListProps): RenderElement {
  const { Box, Text } = kit.ui
  const { files, selected } = props
  const selectedIndex = files.findIndex(file => file.path === selected)
  const { start, end, more } = fileWindowOf(files.length, selectedIndex, MAX_ROWS)
  const maxChange = Math.max(1, ...files.map(file => file.adds + file.dels))
  const rows = files.slice(start, end).map(file => fileRow(file, props, maxChange))

  return (
    <Box flexDirection="column">
      {strip(kit, rows, {
        key: 'file-list',
        grow: 'stretch',
        activeId: selected ? fileRowIdOf(selected) : undefined,
        rowHoverBg: COLORS.userMessageHover,
        activeBg: COLORS.selection,
      })}
      {more > 0 ? (
        <Text key="file-list:more" dimColor>
          … {more} more
        </Text>
      ) : null}
    </Box>
  )
}

/**
 * A row: `❯ ● M <icon> path   +a −d ■■□  ◉`: the selection mark, a status dot and letter beside
 * the icon and path, the add/del count and stat bar right-aligned, and a trailing `◉` in the
 * accent when this file was edited this turn. Spelled out as its own glyph rather than reusing
 * the status dot's `●`: a status dot draws on every row regardless of status, so the two must
 * read as different marks for a glance to tell "what kind of change" from "is this happening right
 * now" apart.
 */
function fileRow(file: ChangedFile, props: FileListProps, maxChange: number): KitRow {
  const icon = iconOf(file.path)
  const mark = statusMarkOf(file.status)
  const id = fileRowIdOf(file.path)
  const select = () => props.onSelect(file.path)
  const bar = statBarCells(file.adds, file.dels, 5, maxChange)

  const left: KitSeg[] = [
    { t: file.path === props.selected ? '❯' : ' ', c: mark.color },
    gap(),
    ...statusSegs(mark),
    gap(),
    { t: icon.glyph, c: icon.color },
    gap(),
    {
      t: file.oldPath ? `${file.oldPath} → ${file.path}` : file.path,
      id,
      shrink: true,
      onPress: select,
    },
  ]
  const right: KitSeg[] = [
    ...(file.adds > 0 ? [{ t: `+${file.adds}`, c: COLORS.added }] : []),
    ...(file.adds > 0 && file.dels > 0 ? [gap()] : []),
    ...(file.dels > 0 ? [{ t: `−${file.dels}`, c: COLORS.removed }] : []),
    gap(),
    { t: '■'.repeat(bar.added), c: COLORS.added },
    { t: '■'.repeat(bar.removed), c: COLORS.removed },
    { t: '□'.repeat(bar.rest), c: COLORS.inactive },
    ...(props.edited.has(file.path) ? [{ t: ' ◉', c: COLORS.accent }] : [{ t: '  ' }]),
  ]
  return { id, left, right, onPress: select }
}

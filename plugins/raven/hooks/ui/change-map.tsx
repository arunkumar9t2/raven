/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../core/colors'
import type { Kit } from '../core/view'
import type { ChangedFile } from '../git/changes'
import { statusMarkOf } from '../views/icons'

const LEVELS = '▁▂▃▄▅▆▇█'

export type ChangeMapCell = { glyph: string; color: string }

/**
 * One glyph per file, in list order: height from `▁▂▃▄▅▆▇█` by the file's share of the
 * largest change in the set (a changed file never draws below `▁`, even a one-line tweak next
 * to a thousand-line file), coloured by status — the file being edited this turn in the accent,
 * so it reads from across the room. More files than `maxCells` keeps the first `maxCells - 1`
 * and ends with one dim `…` cell rather than shrinking every glyph to fit. D10 point 4.
 */
export function changeMapOf(
  files: readonly ChangedFile[],
  editing: ReadonlySet<string>,
  maxCells: number,
): readonly ChangeMapCell[] {
  const cap = Math.max(0, maxCells)
  if (files.length === 0 || cap === 0) return []

  const sizeOf = (file: ChangedFile) => file.adds + file.dels
  const max = Math.max(1, ...files.map(sizeOf))

  const shown = files.length > cap ? files.slice(0, Math.max(0, cap - 1)) : files

  const cells: ChangeMapCell[] = shown.map(file => {
    const ratio = sizeOf(file) / max
    const level = Math.max(1, Math.min(LEVELS.length, Math.ceil(ratio * LEVELS.length)))
    const color = editing.has(file.path) ? COLORS.accent : statusMarkOf(file.status).color
    return { glyph: LEVELS[level - 1] as string, color }
  })

  if (files.length > cap) cells.push({ glyph: '…', color: COLORS.inactive })
  return cells
}

/** The change map as one `Text` of coloured glyph runs, no gaps between cells. */
export function changeMap(
  kit: Kit,
  files: readonly ChangedFile[],
  editing: ReadonlySet<string>,
  maxCells: number,
): RenderElement {
  const { Text } = kit.ui
  const cells = changeMapOf(files, editing, maxCells)

  return (
    <Text wrap="truncate-end">
      {cells.map((cell, index) => (
        <Text key={`cell:${index}`} color={cell.color}>
          {cell.glyph}
        </Text>
      ))}
    </Text>
  )
}

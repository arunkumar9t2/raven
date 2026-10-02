/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../core/colors'
import type { UiKit } from '../core/view'

/** `done/total`'s share of `cells`, rounded to the nearest cell and clamped to `[0, cells]`. */
export function progressCells(done: number, total: number, cells: number): number {
  const safeCells = Math.max(0, cells)
  if (total <= 0 || safeCells === 0) return 0
  return Math.min(safeCells, Math.max(0, Math.round((done / total) * safeCells)))
}

/** `███░░ 3/5` — the session's todo progress, as the official diff mod's `todoBar`. */
export function progressBar(kit: UiKit, done: number, total: number, cells = 5): RenderElement {
  const { Box, Text } = kit.ui
  const filled = progressCells(done, total, cells)

  return (
    <Box flexDirection="row" gap={1}>
      <Text>
        <Text color={COLORS.done}>{'█'.repeat(filled)}</Text>
        <Text color={COLORS.inactive}>{'░'.repeat(Math.max(0, cells - filled))}</Text>
      </Text>
      <Text dimColor>{`${done}/${total}`}</Text>
    </Box>
  )
}

/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../core/colors'
import type { UiKit } from '../core/view'

export type StatBarCells = { added: number; removed: number; rest: number }

/**
 * `cells` split proportionally between `added` and `removed`, GitHub-bar style — the rounding
 * rule this kit pins:
 *
 * 1. Zero/zero gets no added or removed cells at all; `rest` takes every cell.
 * 2. Otherwise each side's share floors to a whole cell (`added / total * cells`, likewise
 *    `removed`), which leaves at most one cell unplaced (the two raw shares sum to exactly
 *    `cells`, so their floors sum to `cells` or `cells - 1`).
 * 3. That one leftover cell, if any, goes first to a side that is non-zero but floored to
 *    nothing — so a real change is never invisible once `cells >= 2` — else to the side with the
 *    larger fractional remainder, ties favouring `added`.
 */
export function statBarCells(added: number, removed: number, cells: number): StatBarCells {
  const safeCells = Math.max(0, cells)
  const total = added + removed
  if (total <= 0 || safeCells === 0) return { added: 0, removed: 0, rest: safeCells }

  const addedRaw = (added / total) * safeCells
  const removedRaw = (removed / total) * safeCells
  let addedCells = Math.floor(addedRaw)
  let removedCells = Math.floor(removedRaw)
  let remainder = safeCells - addedCells - removedCells

  while (remainder > 0) {
    if (added > 0 && addedCells === 0) {
      addedCells += 1
    } else if (removed > 0 && removedCells === 0) {
      removedCells += 1
    } else if (addedRaw - addedCells >= removedRaw - removedCells) {
      addedCells += 1
    } else {
      removedCells += 1
    }
    remainder -= 1
  }

  return {
    added: addedCells,
    removed: removedCells,
    rest: Math.max(0, safeCells - addedCells - removedCells),
  }
}

/** `■■■□□` — added cells in the added colour, removed in the removed colour, the rest inactive. */
export function statBar(kit: UiKit, added: number, removed: number, cells = 5): RenderElement {
  const { Text } = kit.ui
  const bar = statBarCells(added, removed, cells)

  return (
    <Text wrap="truncate-end">
      {bar.added > 0 ? <Text color={COLORS.added}>{'■'.repeat(bar.added)}</Text> : ''}
      {bar.removed > 0 ? <Text color={COLORS.removed}>{'■'.repeat(bar.removed)}</Text> : ''}
      {bar.rest > 0 ? <Text color={COLORS.inactive}>{'□'.repeat(bar.rest)}</Text> : ''}
    </Text>
  )
}

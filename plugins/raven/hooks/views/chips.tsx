/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../core/view'

export type Chip = {
  key: string
  label: string
  icon: string
  onPress: () => void
  variant?: 'primary'
  isDim?: boolean
}

/** Drawn width of a non-plain terminal `Button`: `[ label ]`. */
const buttonWidthOf = (label: string): number => label.length + 4

/**
 * `'words'` when every chip drawn as `[ icon label ]`, with one space between chips, fits
 * `room`; else `'icons'`. Pure and JSX-free so it stays cheap to unit test.
 */
export function chipsFit(
  chips: readonly Pick<Chip, 'label' | 'icon'>[],
  room: number,
): 'words' | 'icons' {
  if (chips.length === 0) return 'words'
  const width =
    chips.reduce((sum, chip) => sum + buttonWidthOf(`${chip.icon} ${chip.label}`), 0) +
    (chips.length - 1)
  return width <= room ? 'words' : 'icons'
}

/** A nowrap row of non-plain `Button`s: `icon label` in words mode, bare `icon` in icons mode. */
export function chipRow(kit: Kit, chips: readonly Chip[], mode: 'words' | 'icons'): RenderElement {
  const { Box, Button } = kit.ui
  return (
    <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
      {chips.map(chip => (
        <Button
          key={chip.key}
          label={mode === 'words' ? `${chip.icon} ${chip.label}` : chip.icon}
          variant={chip.variant}
          dimColor={chip.isDim}
          onPress={chip.onPress}
        />
      ))}
    </Box>
  )
}

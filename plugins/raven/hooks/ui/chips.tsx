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
  /** Dim at rest, full strength under the pointer or the focus (`Button`'s own `dimColor`) — D10's quiet chips. */
  isDim?: boolean
  /** Keeps this chip's full "icon label" wording even in icons mode — an armed confirm never clips to its bare icon. */
  forceWords?: boolean
}

/** `icon` and `label` joined by one space, either of which may be empty (`"✕"`, `"resend"`). */
const wordsOf = (icon: string, label: string): string => [icon, label].filter(Boolean).join(' ')

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
    chips.reduce((sum, chip) => sum + buttonWidthOf(wordsOf(chip.icon, chip.label)), 0) +
    (chips.length - 1)
  return width <= room ? 'words' : 'icons'
}

/**
 * A nowrap row of non-plain `Button`s: `icon label` in words mode, bare `icon` in icons mode
 * (a `forceWords` chip keeps its words either way). A quiet chip (`isDim`) draws dim at rest —
 * `ButtonProps.dimColor`'s own documented behaviour already goes "full strength under the
 * pointer or the focus", so D10's "quiet at rest, loud under the pointer" falls out of
 * `dimColor` alone.
 *
 * NEEDS_CONTEXT: an explicit `hover={{ dimColor: false }}` override (so the *whole* toolbar row
 * lights together, not just the one chip directly under the pointer) was tried and measured —
 * every chip in this mod that sets `hover` has it come back stripped from the resolved tree, on
 * both a bare `InfoNotice` fixture and a real mounted `Pane`, with the chip nested at one level
 * (a direct `Box` child) or several (through `row`'s slot wrapper). Either this test harness
 * doesn't model that part of the hover contract yet, or a nesting rule beyond "a keyed ancestor
 * exists" applies that the type doc doesn't spell out. Left off rather than shipped unverified.
 */
export function chipRow(kit: Kit, chips: readonly Chip[], mode: 'words' | 'icons'): RenderElement {
  const { Box, Button } = kit.ui
  return (
    <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
      {chips.map(chip => (
        <Button
          key={chip.key}
          label={mode === 'words' || chip.forceWords ? wordsOf(chip.icon, chip.label) : chip.icon}
          variant={chip.variant}
          dimColor={chip.isDim}
          onPress={chip.onPress}
        />
      ))}
    </Box>
  )
}

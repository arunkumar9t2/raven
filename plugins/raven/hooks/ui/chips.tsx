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
  /** An engine keybinding action (e.g. `app:diffFileListUp`) the chord presses, same as `ButtonProps.action`. */
  action?: string
  /**
   * The icons-mode text, when it must carry more than the bare `icon` (e.g. `send N`'s icon mode
   * is `➤ N`, not just `➤`). Defaults to `icon` when omitted.
   */
  short?: string
  /**
   * `chipsLayout`'s shrink order: the lowest-priority chip shrinks to icons first, so the row's
   * most important control keeps its words longest. Defaults to `0`; a `forceWords` chip is
   * never a candidate regardless of its priority.
   */
  priority?: number
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

/** `chip`'s drawn width in `mode`, `forceWords` always winning over the mode it's given. */
function widthOf(
  chip: Pick<Chip, 'label' | 'icon' | 'short' | 'forceWords'>,
  mode: 'words' | 'icons',
): number {
  return buttonWidthOf(
    mode === 'words' || chip.forceWords
      ? wordsOf(chip.icon, chip.label)
      : (chip.short ?? chip.icon),
  )
}

/**
 * Priority-aware shrinking: every chip starts in `'words'`; while the row's total drawn width
 * (each chip's width plus one gap between them) exceeds `room`, the lowest-`priority` chip
 * still in words shrinks to icons, one at a time, until it fits or there is nothing left to
 * shrink (a `forceWords` chip is never a candidate — it always draws its full words). Ties keep
 * the chips' own order. Unlike `chipsFit`, this is per-chip, not all-or-nothing: the row's most
 * important chip (highest `priority`) keeps its words for as long as the room allows any chip
 * to, and only gives way itself once every lower-priority chip has already shrunk and the row
 * still doesn't fit.
 */
export function chipsLayout(chips: readonly Chip[], room: number): readonly ('words' | 'icons')[] {
  const modes: ('words' | 'icons')[] = chips.map(() => 'words')
  const totalWidth = () =>
    chips.reduce((sum, chip, i) => sum + widthOf(chip, modes[i] as 'words' | 'icons'), 0) +
    Math.max(0, chips.length - 1)

  const shrinkOrder = chips
    .map((chip, index) => ({
      index,
      priority: chip.priority ?? 0,
      forceWords: chip.forceWords ?? false,
    }))
    .filter(candidate => !candidate.forceWords)
    .sort((a, b) => a.priority - b.priority)

  for (const { index } of shrinkOrder) {
    if (totalWidth() <= room) break
    modes[index] = 'icons'
  }
  return modes
}

/**
 * A nowrap row of non-plain `Button`s: `icon label` in words mode, bare `icon` in icons mode
 * (a `forceWords` chip keeps its words either way). A quiet chip (`isDim`) draws dim at rest —
 * `ButtonProps.dimColor`'s own documented behaviour already goes "full strength under the
 * pointer or the focus", so D10's "quiet at rest, loud under the pointer" falls out of
 * `dimColor` alone, per chip.
 *
 * `scope`, when given, additionally wires every quiet chip in this row into one named hover
 * group (`BoxHoverProps`/`TextHoverProps`'s `scope`, types/claude-code.d.ts ≈715–724 and
 * ≈11814–11823): the pointer resting on *any* chip bearing the group's name is meant to light
 * every chip that names it, not just the one directly under the pointer — D10's "the whole row
 * lights together".
 *
 * On verifying this once round 1 shipped per-chip `dimColor` alone, `hover` (Box's own and
 * Button's/Text's) on the resolved tree is unconditionally absent from `ui.find()`'s
 * `FoundElement.props` in this harness — confirmed again here, with `scope` set, with the scope
 * matching an ancestor `Box`'s key and matching the Button's own key, and on a bare `Box.hover`
 * with no scope at all; none of them showed up. This is not a refusal of this usage in
 * particular: the type doc says, for all three of `BoxHoverProps`, `ButtonProps.hover` and
 * `TextHoverProps`, the identical "No hook runs and nothing crosses to the plugin" — the same
 * category `FoundElement.props` already documents for a handler ("a Button's `onPress` is not
 * here"). So `hover` not reaching `ui.find()` is the contract working as specified, not a sign
 * it was dropped or refused; there is no prop-level test that can confirm it either way. A real
 * mouse hover would, but this harness's input simulation (`ui.press`, `ui.select`, `ui.scroll`)
 * has no hover-only pointer-move event to drive one. Shipped per the doc's contract; see
 * `ui-kit.test.ts` for the smoke test this leaves (draws with no refusal) in place of a
 * prop assertion.
 */
export function chipRow(
  kit: Kit,
  chips: readonly Chip[],
  mode: 'words' | 'icons' | readonly ('words' | 'icons')[],
  scope?: string,
): RenderElement {
  const { Box, Button } = kit.ui
  const modeOf = (index: number): 'words' | 'icons' => {
    if (typeof mode === 'string') return mode
    return mode[index] ?? 'icons'
  }
  return (
    <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
      {chips.map((chip, index) => (
        <Button
          key={chip.key}
          label={
            modeOf(index) === 'words' || chip.forceWords
              ? wordsOf(chip.icon, chip.label)
              : (chip.short ?? chip.icon)
          }
          action={chip.action}
          variant={chip.variant}
          dimColor={chip.isDim}
          hover={chip.isDim && scope !== undefined ? { scope, dimColor: false } : undefined}
          onPress={chip.onPress}
        />
      ))}
    </Box>
  )
}

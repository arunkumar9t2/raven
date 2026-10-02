/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { UiKit } from '../core/view'

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
   * Keeps this chip mounted (so its `action` chord still answers) but drawn with zero width —
   * `Button`'s own `ButtonProps.action` fires "while mounted", a `display: 'none'` `Box` still
   * mounts its child, just without drawing it (confirmed live: ctrl+↓ still moved the file list's
   * `❯` with its Button's wrapping `Box` set `display="none"`). Used for a chip whose chord must
   * keep answering at a width too narrow to draw it (ruling R30) — unlike simply leaving the chip
   * out of the array, which would unmount its `Button` and the chord with it.
   */
  hidden?: boolean
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

/** `chip`'s drawn width in `mode`, `forceWords` always winning over the mode it's given — `0` for
 * a `hidden` chip, which draws nothing. */
function widthOf(
  chip: Pick<Chip, 'label' | 'icon' | 'short' | 'forceWords' | 'hidden'>,
  mode: 'words' | 'icons',
): number {
  if (chip.hidden) return 0
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
  const visibleCount = chips.filter(chip => !chip.hidden).length
  const totalWidth = () =>
    chips.reduce((sum, chip, i) => sum + widthOf(chip, modes[i] as 'words' | 'icons'), 0) +
    Math.max(0, visibleCount - 1)

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
 * ≈11814–11823): the pointer resting on *any* chip bearing the group's name lights every chip
 * that names it, not just the one directly under the pointer — the whole row lights together.
 * This works: confirmed live in a real terminal (tmux), not just drawn with no refusal — at rest
 * every chip in the row renders dim (`38;5;246`); with the pointer on one chip, every sibling
 * sharing its `scope` drops to full strength and the pointed chip itself inverts. tmux has no
 * dedicated "hover" input, but an SGR mouse *motion* event drives it the same as a real pointer
 * move: `printf '\e[<35;%d;%dM' <col> <row>` into the pane (button code 35 = motion, no button
 * held) over a chip's cell lights the row without a click.
 *
 * `hover` (Box's own and Button's/Text's) on the resolved tree is unconditionally absent from
 * `ui.find()`'s `FoundElement.props` in this harness regardless — confirmed with `scope` set,
 * with the scope matching an ancestor `Box`'s key and matching the Button's own key, and on a
 * bare `Box.hover` with no scope at all; none of them showed up there. That is the contract
 * working as specified (the type doc says the same "No hook runs and nothing crosses to the
 * plugin" for all three of `BoxHoverProps`, `ButtonProps.hover` and `TextHoverProps`, the same
 * category `FoundElement.props` already documents for a handler), not a sign the feature was
 * dropped — `ui.find()` just can't assert it as a prop; the tmux probe above is what actually
 * confirms the behaviour. `ui-kit.test.ts` keeps the no-refusal smoke test for the harness side;
 * this comment is the record of the real-terminal check.
 */
export function chipRow(
  kit: UiKit,
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
        <Box key={`${chip.key}:wrap`} display={chip.hidden ? 'none' : 'flex'}>
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
        </Box>
      ))}
    </Box>
  )
}

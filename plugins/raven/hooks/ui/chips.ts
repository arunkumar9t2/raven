import type { PillKind } from '../core/colors'
import { widthOf as cellsOf } from './wrap'

/**
 * A control a row offers, as data: `pillRow` (`ui/strip.tsx`) draws it as a pill, and the layout
 * functions below size a row of them — shrinking to icons when the row is narrow — before it draws.
 */
export type Chip = {
  key: string
  label: string
  icon: string
  onPress: () => void
  /** The pill's colours: `primary` for a pane's main action, `armed` for a confirm; `normal` when omitted. */
  kind?: PillKind
  /** Keeps this chip's full "icon label" wording even in icons mode — an armed confirm never clips to its bare icon. */
  forceWords?: boolean
  /**
   * An engine keybinding action (e.g. `app:diffFileListUp`) the chord presses, same as
   * `ButtonProps.action`. A `Client` cannot bind an engine chord, so such a chip draws as a `plain`
   * `Button` beside the strip; it is sized like a pill.
   */
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

/** The text `chip` draws in `mode`; `forceWords` always wins over the mode. */
export function chipText(
  chip: Pick<Chip, 'label' | 'icon' | 'short' | 'forceWords'>,
  mode: 'words' | 'icons',
): string {
  return mode === 'words' || chip.forceWords
    ? wordsOf(chip.icon, chip.label)
    : (chip.short ?? chip.icon)
}

/** Drawn width of a pill: its text with one padding cell each side — the one pill-width rule. */
export const pillWidthOf = (text: string): number => cellsOf(text) + 2

/**
 * `'words'` when every chip drawn as a pill with its words, one space between chips, fits `room`;
 * else `'icons'`. Pure so it stays cheap to unit test.
 */
export function chipsFit(
  chips: readonly Pick<Chip, 'label' | 'icon'>[],
  room: number,
): 'words' | 'icons' {
  return chipsWidthOf(chips) <= room ? 'words' : 'icons'
}

/** The cells a row of pills with their words takes, one gap between them; 0 for none. */
export function chipsWidthOf(chips: readonly Pick<Chip, 'label' | 'icon'>[]): number {
  if (chips.length === 0) return 0
  return (
    chips.reduce((sum, chip) => sum + pillWidthOf(wordsOf(chip.icon, chip.label)), 0) +
    (chips.length - 1)
  )
}

/**
 * The cells a row of chips takes with every chip bare-iconed (`short` when given, else `icon`), one
 * gap between: the floor `chipsLayout` can shrink a row to. A `forceWords` chip is not special here.
 */
export function chipsIconsWidthOf(chips: readonly Pick<Chip, 'icon' | 'short'>[]): number {
  if (chips.length === 0) return 0
  return (
    chips.reduce((sum, chip) => sum + pillWidthOf(chip.short ?? chip.icon), 0) + (chips.length - 1)
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
    chips.reduce((sum, chip, i) => sum + pillWidthOf(chipText(chip, modes[i] ?? 'icons')), 0) +
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

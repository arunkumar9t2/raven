/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement, SelectOption } from 'claude-code'

import { COLORS } from '../../core/colors'
import { countOf } from '../../core/format'
import type { Kit } from '../../core/view'
import type { ChangedFile } from '../../git/changes'
import { changeMap, changeMapOf } from '../../ui/change-map'
import { type Chip, chipsLayout } from '../../ui/chips'
import { diffStat } from '../../ui/diff-stat'
import { statBar } from '../../ui/stat-bar'
import { pillRow } from '../../ui/strip'
import { selectButtons } from '../select-buttons'

/** The Nerd Font git mark (nf-md-git) leading row 1, in `COLORS.git`. */
const GIT_ICON = '\u{f02a2}'

/** The source Select's element key, for a test or a focus target. */
export const SOURCE_SELECT_KEY = 'source'

/** Row 1's own key — counts, the change bar and the view controls (source, nav, refresh). */
export const SUMMARY_ROW_KEY = 'header:summary'
/** Row 2's own key — the change map, the notes summary, and the review-action chips. */
export const ACTIONS_ROW_KEY = 'header:actions'

export type HeaderProps = {
  files: readonly ChangedFile[]
  /** Paths an edit touched this turn; the change map draws that file's cell in the accent. */
  edited: ReadonlySet<string>
  pending: number
  confirmingClear: boolean
  sourceValue: string
  sourceOptions: readonly SelectOption[]
  onSourceChange: (value: string) => void
  onRefresh: () => void
  onSend: () => void
  onEditSend: () => void
  onPrevious: () => void
  onNext: () => void
  onClear: () => void
}

// Mirrors diff/source.ts's turnValueOf prefix; a turn has no name to put on a button, so the
// button row omits turns and offers HEAD/session/branch point only.
const TURN_PREFIX = 'turn:'

/** The source options as a row of plain buttons, for a surface without `canPick`. */
function sourceButtons(kit: Kit, props: HeaderProps): RenderElement {
  return selectButtons(kit, {
    key: 'source',
    options: props.sourceOptions.filter(option => !option.value.startsWith(TURN_PREFIX)),
    value: props.sourceValue,
    onSelect: props.onSourceChange,
  })
}

/**
 * Row 1: a git mark, counts, the change bar, a dim `·`, then the source picker — `6 files  +15 −12  ■■■□□
 * · source HEAD ▾` — all packed on the left with nothing at the row's far right. `justifyContent:
 * "space-between"` would stretch the picker flush against the pane's right edge, where it reads
 * as one control fused with the engine's own pane chrome in that corner; this keeps every
 * control visually inside the row instead. The source control is a `Select`/button row, not a
 * chip, and can't shrink the way a chip does, so it gets this row to itself; every chip (nav,
 * refresh, review actions) lives on row 2 instead, where `chipsLayout` shrinks them one at a
 * time by priority.
 */
function summaryRow(kit: Kit, props: HeaderProps): RenderElement {
  const { Box, Text, Select } = kit.ui
  const { files } = props
  const adds = files.reduce((sum, file) => sum + file.adds, 0)
  const dels = files.reduce((sum, file) => sum + file.dels, 0)

  return (
    <Box key={SUMMARY_ROW_KEY} flexDirection="row" gap={2} overflow="hidden" flexWrap="nowrap">
      <Text color={COLORS.git}>{GIT_ICON}</Text>
      <Text bold wrap="truncate-end">
        {countOf(files.length, 'file')}
      </Text>
      {diffStat(kit, adds, dels)}
      {statBar(kit, adds, dels)}
      <Text dimColor wrap="truncate-end">
        ·
      </Text>
      {kit.capabilities.canPick ? (
        <Select
          key={SOURCE_SELECT_KEY}
          label="source"
          options={props.sourceOptions}
          value={props.sourceValue}
          onSelect={props.onSourceChange}
        />
      ) : (
        sourceButtons(kit, props)
      )}
    </Box>
  )
}

/** The reserved minimum the change map keeps even at the narrowest docked body (rulings R28, R30)
 * — `changeMapOf`'s own overflow `…` rule still applies on top of this cap. `2`, not `3`: ruling
 * R30 below keeps nav in the row at every width, which costs 12 more columns than the old
 * nav-less floor (two icon pills, 3 columns each, plus the two extra gaps between a now-5-chip
 * instead of 3-chip row), and shaving one more cell off the map is part of what closes the
 * arithmetic back to 38 columns (measured against the R28/R30 test fixtures — 5 files, 2 pending,
 * `bodyColumns: 38`; a third fixture at 10 pending needed the compact notes summary's own digit
 * dropped too — see `compactNotesText` below). */
const MIN_MAP_CELLS = 2

/**
 * `chips`' own icons-mode floor: every chip bare-iconed (`short` when given, else `icon`),
 * padded as a pill (one cell each side), with one gap between — the same width model
 * `chips.ts` uses for `chipsLayout`'s own sizing, kept here only for that floor
 * (nothing passed to it is ever `forceWords`; that only happens during an armed confirm, which
 * never reaches this helper) to decide whether nav and refresh must give way before the map and
 * the notes summary are squeezed below R28's reserved minimum.
 */
function iconsWidthOf(chips: readonly Chip[]): number {
  if (chips.length === 0) return 0
  const total = chips.reduce((sum, chip) => sum + (chip.short ?? chip.icon).length + 2, 0)
  return total + (chips.length - 1)
}

/**
 * Row 2: the change map — one glyph per file, the shape of the whole change at a glance, D10
 * point 4 — and the notes summary on the left; every control chip — nav, refresh, edit & send,
 * the one primary `send N`, and clear — on the right. `chipsLayout` shrinks the chips that can
 * safely shrink one at a time, lowest priority first (refresh, then clear, then edit & send,
 * then `send N` last), so the row's most important action keeps its words longest; the armed
 * clear keeps its full words regardless (`forceWords`), same as a hunk's armed revert.
 *
 * Ruling R27: while a clear is armed, the nav and refresh chips drop from the row entirely
 * (not just shrink to icons) and the map/notes summary on the left drop too — the only thing
 * on this row that matters while the person decides is the confirm itself, and both changes
 * together are what keeps the confirm's full words inside even the narrowest docked pane.
 *
 * Ruling R28: with nothing armed, the map and the notes summary degrade instead of vanishing.
 * Every chip bare-iconed can still cost more than the row has — six chips, each drawn
 * as a padded pill, add up fast — which would otherwise starve the left side to nothing before
 * `chipsLayout` ever gets a say (the chips' own `Box` is `flexShrink: 0`; the left side's is
 * `flexShrink: 1`, so it is the one that gives, all the way to 0 if it has to — caught live at a
 * docked pane's real width, see the task report). When the full chip set's own icons floor would
 * do that, refresh — already a keybinding, not just a chip — gives way entirely, the same chip
 * the row drops first during an armed confirm (R27), freeing room for the map's guaranteed
 * `MIN_MAP_CELLS` and the summary's compact `✎N`.
 *
 * Ruling R30: nav (`previous`/`next`) never gives way, in words or icons or by dropping — unlike
 * every other chip here, nav's two Buttons are the file list's *only* carriers of
 * `action="app:diffFileListUp/Down"`. An earlier version of this fix kept them mounted but drawn
 * at zero width (`display: "none"`), reasoning that the chord only needs the Button mounted, not
 * visible — true as far as it went (live tmux: the chord still moved the list's `❯` through a
 * `display: "none"` wrapper), but it missed the Tab ring, which walks onto a mounted Button
 * whether or not it draws anything. Confirmed live with that version: ctrl+x tab, then one more
 * Tab, opened the Select's dropdown with "HEAD" marked reverse-video; Tab 3 closed it with no
 * mark anywhere on screen; Tab 4 drew no mark either; Tab 5 finally landed, marked, on `clear`.
 * Tabs 3 and 4 were the two invisible `previous`/`next` stops — the Tab ring silently passed
 * through both, which is worse than dropping them: at least an unmounted Button can't strand the
 * keyboard on nothing the person can see. The engine's `ButtonProps` has no `focusable`/
 * `tabIndex` escape from this, so nav instead stays visible at every width (this function's own
 * fallback, named in the original ruling) — confirmed live with the real fix: the same ctrl+x tab
 * and two Tabs reach the Select exactly as before, but Tab 3 now lands, marked, directly on
 * ` ↑ `. `MIN_MAP_CELLS` (above) absorbs the extra columns nav's two Buttons always cost now
 * that they can no longer give way. A `Client` strip cannot bind an engine chord, so nav keeps
 * drawing as two `plain` Buttons (no brackets, label padded like a pill) beside the strip that
 * `pillRow` draws for every other chip.
 */
function actionsRow(kit: Kit, props: HeaderProps): RenderElement {
  const { Box, Text } = kit.ui
  const { pending, confirmingClear } = props

  const chipsOf = (includeRefresh: boolean): Chip[] => {
    const chips: Chip[] = []
    if (!confirmingClear) {
      chips.push(
        {
          key: 'previous',
          action: 'app:diffFileListUp',
          icon: '↑',
          label: '',
          priority: 0,
          onPress: props.onPrevious,
        },
        {
          key: 'next',
          action: 'app:diffFileListDown',
          icon: '↓',
          label: '',
          priority: 0,
          onPress: props.onNext,
        },
      )
      if (includeRefresh) {
        chips.push({
          key: 'refresh',
          icon: '↻',
          label: 'refresh',
          priority: 1,
          onPress: props.onRefresh,
        })
      }
    }
    if (pending > 0) {
      chips.push(
        {
          key: 'edit-send',
          icon: '✎',
          label: 'edit & send',
          priority: 3,
          onPress: props.onEditSend,
        },
        {
          key: 'send',
          icon: '➤',
          short: `➤ ${pending}`,
          label: `send ${pending}`,
          kind: 'primary',
          priority: 4,
          onPress: props.onSend,
        },
      )
    }
    chips.push({
      key: 'clear',
      icon: '⌫',
      label: confirmingClear ? 'clear all?' : 'clear',
      kind: confirmingClear ? 'armed' : 'danger',
      forceWords: confirmingClear,
      priority: 2,
      onPress: props.onClear,
    })
    return chips
  }

  const maxCells = Math.floor(kit.columns / 3)
  const fullNotesText =
    !confirmingClear && pending > 0 ? `✎ ${countOf(pending, 'note')} pending` : ''
  const compactNotesText = !confirmingClear && pending > 0 ? '✎' : ''
  const fullChips = chipsOf(true)
  const fullMapCells = confirmingClear ? [] : changeMapOf(props.files, props.edited, maxCells)
  const fullLeftWidth = fullMapCells.length + (fullNotesText === '' ? 0 : 1 + fullNotesText.length)
  const ample = confirmingClear || fullLeftWidth + 2 + iconsWidthOf(fullChips) <= kit.columns

  const effectiveMaxCells = ample ? maxCells : MIN_MAP_CELLS
  const notesText = ample ? fullNotesText : compactNotesText
  const chips = ample ? fullChips : chipsOf(false)
  const room = Math.max(0, kit.columns - fullLeftWidth - 2)
  const modes = chipsLayout(chips, room)

  return (
    <Box
      key={ACTIONS_ROW_KEY}
      flexDirection="row"
      justifyContent="space-between"
      gap={2}
      overflow="hidden"
      flexWrap="nowrap"
    >
      <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap" flexShrink={1}>
        {confirmingClear ? null : changeMap(kit, props.files, props.edited, effectiveMaxCells)}
        {notesText !== '' ? (
          <Text color={COLORS.suggestion} wrap="truncate-end">
            {notesText}
          </Text>
        ) : null}
      </Box>
      <Box flexShrink={0}>{pillRow(kit, chips, modes, ACTIONS_ROW_KEY)}</Box>
    </Box>
  )
}

/**
 * Two fixed rows, neither ever wraps: counts, the change bar and view controls on top; the
 * change map, the notes summary and the review-action chips below — D10's first-principles
 * header (point 4's "shape of the change at a glance" and point 5's "quiet controls, loud
 * intent"). Siblings, not children of a `Fragment`: a `Fragment` draws as its own box and would
 * wrap this column.
 */
export function header(kit: Kit, props: HeaderProps): RenderElement {
  const { Box } = kit.ui
  return (
    <Box flexDirection="column">
      {summaryRow(kit, props)}
      {actionsRow(kit, props)}
    </Box>
  )
}

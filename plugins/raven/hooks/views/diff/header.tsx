/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement, SelectOption } from 'claude-code'

import { COLORS } from '../../core/colors'
import { countOf } from '../../core/format'
import type { Kit } from '../../core/view'
import type { ChangedFile } from '../../git/changes'
import { changeMap, changeMapOf } from '../../ui/change-map'
import { type Chip, chipRow, chipsLayout } from '../../ui/chips'
import { diffStat } from '../../ui/diff-stat'
import { statBar } from '../../ui/stat-bar'
import { selectButtons } from '../select-buttons'

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
 * Row 1: counts, the change bar, a dim `·`, then the source picker — `6 files  +15 −12  ■■■□□
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

/**
 * Row 2: the change map — one glyph per file, the shape of the whole change at a glance, D10
 * point 4 — and the notes summary on the left; every control chip — nav, refresh, edit & send,
 * the one primary `send N`, and clear — on the right. `chipsLayout` shrinks them one at a time,
 * lowest priority first (nav, then refresh, then clear, then edit & send, then `send N` last),
 * so the row's most important action keeps its words longest; the armed clear keeps its full
 * words regardless (`forceWords`), same as a hunk's armed revert.
 *
 * Ruling R27: while a clear is armed, the nav and refresh chips drop from the row entirely
 * (not just shrink to icons) and the map/notes summary on the left drop too — the only thing
 * on this row that matters while the person decides is the confirm itself, and both changes
 * together are what keeps the confirm's full words inside even the narrowest docked pane.
 */
function actionsRow(kit: Kit, props: HeaderProps): RenderElement {
  const { Box, Text } = kit.ui
  const { pending, confirmingClear } = props

  const chips: Chip[] = []
  if (!confirmingClear) {
    chips.push(
      {
        key: 'previous',
        action: 'app:diffFileListUp',
        icon: '↑',
        label: '',
        isDim: true,
        priority: 0,
        onPress: props.onPrevious,
      },
      {
        key: 'next',
        action: 'app:diffFileListDown',
        icon: '↓',
        label: '',
        isDim: true,
        priority: 0,
        onPress: props.onNext,
      },
      {
        key: 'refresh',
        icon: '↻',
        label: 'refresh',
        isDim: true,
        priority: 1,
        onPress: props.onRefresh,
      },
    )
  }
  if (pending > 0) {
    chips.push({
      key: 'edit-send',
      icon: '✎',
      label: 'edit & send',
      isDim: true,
      priority: 3,
      onPress: props.onEditSend,
    })
    chips.push({
      key: 'send',
      icon: '➤',
      short: `➤ ${pending}`,
      label: `send ${pending}`,
      variant: 'primary',
      priority: 4,
      onPress: props.onSend,
    })
  }
  chips.push({
    key: 'clear',
    icon: '⌫',
    label: confirmingClear ? 'clear all?' : 'clear',
    isDim: !confirmingClear,
    forceWords: confirmingClear,
    priority: 2,
    onPress: props.onClear,
  })

  // The map and the notes summary share this row's left side with the chips, so `chipsLayout`'s
  // room must account for their real (variable) width, not a fixed reserve — else the chips are
  // measured against room the left side already spent (caught live at a docked pane's real
  // width; see the task report). While armed, the left side is empty (R27), so this collapses
  // to 0 and the chips get the whole row.
  const maxCells = Math.floor(kit.columns / 3)
  const mapCells = confirmingClear ? [] : changeMapOf(props.files, props.edited, maxCells)
  const notesText = !confirmingClear && pending > 0 ? `✎ ${countOf(pending, 'note')} pending` : ''
  const leftWidth = mapCells.length + (notesText === '' ? 0 : 1 + notesText.length)
  const room = Math.max(0, kit.columns - leftWidth - 2)
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
        {confirmingClear ? null : changeMap(kit, props.files, props.edited, maxCells)}
        {notesText !== '' ? (
          <Text color={COLORS.suggestion} wrap="truncate-end">
            {notesText}
          </Text>
        ) : null}
      </Box>
      <Box flexShrink={0}>{chipRow(kit, chips, modes, ACTIONS_ROW_KEY)}</Box>
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

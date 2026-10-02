/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement, SelectOption } from 'claude-code'

import { COLORS } from '../../core/colors'
import { countOf } from '../../core/format'
import type { Kit } from '../../core/view'
import type { ChangedFile } from '../../git/changes'
import { changeMap, changeMapOf } from '../../ui/change-map'
import { type Chip, chipRow, chipsFit } from '../../ui/chips'
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
 * Row 1: the counts and change bar on the left; the source picker alone on the right — D10's
 * mockup row 1. The source control is a `Select`/button row, not a chip, and can't shrink the
 * way a chip does, so it gets this row to itself; every chip (nav, refresh, review actions)
 * lives on row 2 instead, where `chipsFit` alone decides words vs. icons.
 */
function summaryRow(kit: Kit, props: HeaderProps): RenderElement {
  const { Box, Text, Select } = kit.ui
  const { files } = props
  const adds = files.reduce((sum, file) => sum + file.adds, 0)
  const dels = files.reduce((sum, file) => sum + file.dels, 0)

  return (
    <Box
      key={SUMMARY_ROW_KEY}
      flexDirection="row"
      justifyContent="space-between"
      gap={2}
      overflow="hidden"
      flexWrap="nowrap"
    >
      <Box flexDirection="row" gap={2} overflow="hidden" flexWrap="nowrap">
        <Text bold wrap="truncate-end">
          {countOf(files.length, 'file')}
        </Text>
        {diffStat(kit, adds, dels)}
        {statBar(kit, adds, dels)}
      </Box>
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
 * the one primary `send N`, and clear — on the right, all through one `chipsFit` so they shrink
 * together. The armed clear keeps its full words even squeezed, same as a hunk's armed revert.
 */
function actionsRow(kit: Kit, props: HeaderProps): RenderElement {
  const { Box, Text } = kit.ui
  const { pending } = props

  const chips: Chip[] = [
    {
      key: 'previous',
      action: 'app:diffFileListUp',
      icon: '↑',
      label: '',
      isDim: true,
      onPress: props.onPrevious,
    },
    {
      key: 'next',
      action: 'app:diffFileListDown',
      icon: '↓',
      label: '',
      isDim: true,
      onPress: props.onNext,
    },
    { key: 'refresh', icon: '↻', label: 'refresh', isDim: true, onPress: props.onRefresh },
  ]
  if (pending > 0) {
    chips.push({
      key: 'edit-send',
      icon: '✎',
      label: 'edit & send',
      isDim: true,
      onPress: props.onEditSend,
    })
    chips.push({
      key: 'send',
      icon: '➤',
      short: `➤ ${pending}`,
      label: `send ${pending}`,
      variant: 'primary',
      onPress: props.onSend,
    })
  }
  chips.push({
    key: 'clear',
    icon: '⌫',
    label: props.confirmingClear ? 'clear all?' : 'clear',
    isDim: !props.confirmingClear,
    forceWords: props.confirmingClear,
    onPress: props.onClear,
  })

  // `chipsFit`'s room must account for the map and the notes summary sharing this row — they
  // are real, variable-width content, not reserved chrome like `HEADER_MIN` — else the chips
  // are measured against room the left side has already spent, and decide "words" fits when it
  // doesn't (caught live at a docked pane's real width; see the task report).
  const maxCells = Math.floor(kit.columns / 3)
  const mapWidth = changeMapOf(props.files, props.edited, maxCells).length
  const notesText = pending > 0 ? `✎ ${countOf(pending, 'note')} pending` : ''
  const leftWidth = mapWidth + (notesText === '' ? 0 : 1 + notesText.length)
  const room = Math.max(0, kit.columns - leftWidth - 2)
  const mode = chipsFit(chips, room)

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
        {changeMap(kit, props.files, props.edited, maxCells)}
        {notesText !== '' ? (
          <Text color={COLORS.suggestion} wrap="truncate-end">
            {notesText}
          </Text>
        ) : null}
      </Box>
      <Box flexShrink={0}>{chipRow(kit, chips, mode, ACTIONS_ROW_KEY)}</Box>
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

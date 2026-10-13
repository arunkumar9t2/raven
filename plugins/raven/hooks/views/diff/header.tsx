/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement, SelectOption } from 'claude-code'

import { COLORS } from '../../core/colors'
import { countOf } from '../../core/format'
import type { Kit } from '../../core/view'
import type { ChangedFile } from '../../git/changes'
import { changeMap, changeMapOf } from '../../ui/change-map'
import { chipsIconsWidthOf, chipsLayout } from '../../ui/chips'
import { diffStat } from '../../ui/diff-stat'
import { iconText, NOTE_GLYPH } from '../../ui/icon-text'
import { pillRow } from '../../ui/strip'
import { selectButtons } from '../select-buttons'
import {
  type HeaderHandlers,
  type HeaderPlan,
  headerChipsOf,
  headerPlanOf,
  MIN_MAP_CELLS,
  sourceLabelOf,
} from './header-plan'

/** The Nerd Font git mark (nf-md-git) leading the header, in `COLORS.git`. */
const GIT_ICON = '\u{f02a2}'

/** The source Select's element key, for a test or a focus target. */
export const SOURCE_SELECT_KEY = 'source'

/** The one-row header's own key: counts, change map, source picker and the controls. */
export const HEADER_ROW_KEY = 'header:row'
/** The two-row fallback's first row: counts and the source picker. */
export const SUMMARY_ROW_KEY = 'header:summary'
/** The two-row fallback's second row: the change map, the notes summary and the chips. */
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

const handlersOf = (props: HeaderProps): HeaderHandlers => ({
  onPrevious: props.onPrevious,
  onNext: props.onNext,
  onRefresh: props.onRefresh,
  onSend: props.onSend,
  onEditSend: props.onEditSend,
  onClear: props.onClear,
})

/** The added and deleted line totals across `files`. */
const totalsOf = (files: readonly ChangedFile[]) => ({
  adds: files.reduce((sum, file) => sum + file.adds, 0),
  dels: files.reduce((sum, file) => sum + file.dels, 0),
})

/** The plan for `props` at `kit.columns`: one row, or the two-row fallback. */
export function headerPlanFor(kit: Kit, props: HeaderProps): HeaderPlan {
  const { adds, dels } = totalsOf(props.files)
  const sourceLabel =
    props.sourceOptions.find(option => option.value === props.sourceValue)?.label ??
    props.sourceValue
  return headerPlanOf({
    columns: kit.columns,
    fileCount: props.files.length,
    adds,
    dels,
    pending: props.pending,
    confirmingClear: props.confirmingClear,
    sourceLabel,
    canPick: kit.capabilities.canPick,
  })
}

/** The source options as a row of plain buttons, for a surface without `canPick`. */
function sourceButtons(kit: Kit, props: HeaderProps): RenderElement {
  return selectButtons(kit, {
    key: 'source',
    options: props.sourceOptions.filter(option => !option.value.startsWith(TURN_PREFIX)),
    value: props.sourceValue,
    onSelect: props.onSourceChange,
  })
}

/** The source control: a `Select`, or plain buttons where the surface has none. */
function sourceControl(kit: Kit, props: HeaderProps): RenderElement {
  const { Select } = kit.ui
  return kit.capabilities.canPick ? (
    <Select
      key={SOURCE_SELECT_KEY}
      label="source"
      options={props.sourceOptions.map(option =>
        option.value === props.sourceValue && option.label !== undefined
          ? { ...option, label: sourceLabelOf(option.label) }
          : option,
      )}
      value={props.sourceValue}
      onSelect={props.onSourceChange}
    />
  ) : (
    sourceButtons(kit, props)
  )
}

/**
 * The one-row header: `󰊢 4 files  +22 −3  ▂█▁▁  ·  source HEAD ▾  <note glyph> 1 note pending      ↑ ↓ ↻ <note glyph> ➤ ⌫`.
 * The left cluster is the counts, the change map right after them, the dim `·` and the source
 * picker (then, when the room allows, the notes summary); the chips sit flush right, sized by
 * `chipsLayout` in the room the cluster leaves, so the lowest-priority chip shrinks to its icon
 * first. The `■■■□□` stat bar is not drawn here: the map already shows the shape of the change and
 * each file-list row keeps its own bar.
 */
function oneRow(
  kit: Kit,
  props: HeaderProps,
  plan: Extract<HeaderPlan, { rows: 1 }>,
): RenderElement {
  const { Box, Text } = kit.ui
  const { files } = props
  const { adds, dels } = totalsOf(files)
  const chips = headerChipsOf(
    { pending: props.pending, confirmingClear: props.confirmingClear, includeRefresh: true },
    handlersOf(props),
  )
  const room = Math.max(0, kit.columns - plan.leftCells - 2)
  const modes = chipsLayout(chips, room)

  return (
    <Box
      key={HEADER_ROW_KEY}
      flexDirection="row"
      justifyContent="space-between"
      gap={2}
      overflow="hidden"
      flexWrap="nowrap"
    >
      <Box flexDirection="row" gap={2} overflow="hidden" flexWrap="nowrap" flexShrink={1}>
        <Text color={COLORS.git}>{GIT_ICON}</Text>
        <Text bold wrap="truncate-end">
          {countOf(files.length, 'file')}
        </Text>
        {adds + dels > 0 ? diffStat(kit, adds, dels) : null}
        {plan.mapCells > 0 ? changeMap(kit, files, props.edited, plan.mapCells) : null}
        <Text dimColor wrap="truncate-end">
          ·
        </Text>
        {sourceControl(kit, props)}
        {plan.notesText !== '' ? (
          <Text color={COLORS.suggestion} wrap="truncate-end">
            {plan.notesText}
          </Text>
        ) : null}
      </Box>
      <Box flexShrink={0}>{pillRow(kit, chips, modes, HEADER_ROW_KEY)}</Box>
    </Box>
  )
}

/** Two-row fallback, row 1: the git mark, counts, a dim `·`, then the source picker. */
function summaryRow(kit: Kit, props: HeaderProps): RenderElement {
  const { Box, Text } = kit.ui
  const { files } = props
  const { adds, dels } = totalsOf(files)

  return (
    <Box key={SUMMARY_ROW_KEY} flexDirection="row" gap={2} overflow="hidden" flexWrap="nowrap">
      <Text color={COLORS.git}>{GIT_ICON}</Text>
      <Text bold wrap="truncate-end">
        {countOf(files.length, 'file')}
      </Text>
      {adds + dels > 0 ? diffStat(kit, adds, dels) : null}
      <Text dimColor wrap="truncate-end">
        ·
      </Text>
      {sourceControl(kit, props)}
    </Box>
  )
}

/**
 * Two-row fallback, row 2: the change map and the notes summary on the left, every control chip on
 * the right. Rulings kept from the original header: R27, while a clear is armed the nav and
 * refresh chips and the map/notes summary drop so the confirm keeps its words even at the
 * narrowest docked pane; R28, with nothing armed the map and the notes summary degrade (map to
 * `MIN_MAP_CELLS`, notes to a bare `<note glyph>`) and `refresh` gives way entirely before they vanish; R30,
 * nav (`previous`/`next`) never gives way, in words, icons or by dropping, because its two Buttons
 * are the file list's only carriers of `action="app:diffFileListUp/Down"` and a mounted-but-hidden
 * Button strands the Tab ring on nothing visible.
 */
function actionsRow(kit: Kit, props: HeaderProps): RenderElement {
  const { Box, Text } = kit.ui
  const { pending, confirmingClear } = props
  const handlers = handlersOf(props)

  const maxCells = Math.floor(kit.columns / 3)
  const fullNotesText =
    !confirmingClear && pending > 0
      ? iconText(NOTE_GLYPH, `${countOf(pending, 'note')} pending`)
      : ''
  const compactNotesText = !confirmingClear && pending > 0 ? NOTE_GLYPH : ''
  const fullChips = headerChipsOf({ pending, confirmingClear, includeRefresh: true }, handlers)
  const fullMapCells = confirmingClear ? [] : changeMapOf(props.files, props.edited, maxCells)
  const fullLeftWidth = fullMapCells.length + (fullNotesText === '' ? 0 : 1 + fullNotesText.length)
  const ample = confirmingClear || fullLeftWidth + 2 + chipsIconsWidthOf(fullChips) <= kit.columns

  const effectiveMaxCells = ample ? maxCells : MIN_MAP_CELLS
  const notesText = ample ? fullNotesText : compactNotesText
  const chips = ample
    ? fullChips
    : headerChipsOf({ pending, confirmingClear, includeRefresh: false }, handlers)
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
 * The header for `plan` (`headerPlanFor`, which the caller also sizes the body with): one row
 * when it fits, else two. Siblings, not children of a `Fragment`: a `Fragment` draws as its own
 * box and would wrap this column.
 */
export function header(kit: Kit, props: HeaderProps, plan: HeaderPlan): RenderElement {
  const { Box } = kit.ui
  if (plan.rows === 1) return oneRow(kit, props, plan)
  return (
    <Box flexDirection="column">
      {summaryRow(kit, props)}
      {actionsRow(kit, props)}
    </Box>
  )
}

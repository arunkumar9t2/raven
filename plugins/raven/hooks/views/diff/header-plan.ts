import { countOf } from '../../core/format'
import { type Chip, chipsIconsWidthOf } from '../../ui/chips'
import { iconText, NOTE_GLYPH } from '../../ui/icon-text'
import { widthOf } from '../../ui/wrap'

/** What each header chip does; `NO_HANDLERS` for the width math, which never presses anything. */
export type HeaderHandlers = {
  onPrevious: () => void
  onNext: () => void
  onRefresh: () => void
  onSend: () => void
  onEditSend: () => void
  onClear: () => void
}

const NOTHING = () => {}
export const NO_HANDLERS: HeaderHandlers = {
  onPrevious: NOTHING,
  onNext: NOTHING,
  onRefresh: NOTHING,
  onSend: NOTHING,
  onEditSend: NOTHING,
  onClear: NOTHING,
}

export type HeaderChipArgs = {
  pending: number
  confirmingClear: boolean
  /** The two-row fallback drops `refresh` when even the icons floor does not fit. */
  includeRefresh: boolean
}

/**
 * The header's controls as data, in drawing order. `chipsLayout` shrinks the lowest `priority`
 * to a bare icon first: nav (0, never gives way: the file list's only chord carriers), refresh
 * (1), clear (2), edit & send (3), send (4). The side-by-side toggle chip (Part D) goes between
 * refresh and clear with `priority: 1.5`, so it gives way right after refresh.
 */
export function headerChipsOf(args: HeaderChipArgs, on: HeaderHandlers = NO_HANDLERS): Chip[] {
  const { pending, confirmingClear } = args
  const chips: Chip[] = []
  if (!confirmingClear) {
    chips.push(
      {
        key: 'previous',
        action: 'app:diffFileListUp',
        icon: '↑',
        label: '',
        priority: 0,
        onPress: on.onPrevious,
      },
      {
        key: 'next',
        action: 'app:diffFileListDown',
        icon: '↓',
        label: '',
        priority: 0,
        onPress: on.onNext,
      },
    )
    if (args.includeRefresh) {
      chips.push({
        key: 'refresh',
        icon: '↻',
        label: 'refresh',
        priority: 1,
        onPress: on.onRefresh,
      })
    }
  }
  if (pending > 0) {
    chips.push(
      {
        key: 'edit-send',
        icon: NOTE_GLYPH,
        label: 'edit & send',
        priority: 3,
        onPress: on.onEditSend,
      },
      {
        key: 'send',
        icon: '➤',
        short: iconText('➤', `${pending}`),
        label: `send ${pending}`,
        kind: 'primary',
        priority: 4,
        onPress: on.onSend,
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
    onPress: on.onClear,
  })
  return chips
}

/** The reserved minimum the change map keeps at the narrowest docked body (rulings R28, R30). */
export const MIN_MAP_CELLS = 2
/** The most cells the one-row header gives the change map. */
export const ONE_ROW_MAP_CELLS = 12

const GIT_ICON_CELLS = 1
const DOT_CELLS = 1
/** The gap between the left cluster's items (`gap={2}` on the row). */
const ITEM_GAP = 2
/** `source ` before the value and ` ▾` after it. */
const SOURCE_CHROME_CELLS = 9
/** The most cells of a source label the width estimate counts. */
const SOURCE_LABEL_MAX = 24
/** A surface without a `Select` draws HEAD / session start / branch point as plain buttons. */
const SOURCE_BUTTONS_CELLS = 40

export type HeaderPlanInput = {
  columns: number
  fileCount: number
  adds: number
  dels: number
  pending: number
  confirmingClear: boolean
  /** The current source option's label (`HEAD`, `turn 3: …`). */
  sourceLabel: string
  canPick: boolean
}

export type HeaderPlan =
  | {
      rows: 1
      /** The change map's cells in the one-row form. */
      mapCells: number
      /** `<note glyph> N notes pending`, or '' when the row has no room for it. */
      notesText: string
      /** The cells the left cluster takes; the chips get `columns - leftCells - 2`. */
      leftCells: number
    }
  | { rows: 2 }

/** `+a −d` with a zero side left out, as `diffStat` draws it. */
const statCellsOf = (adds: number, dels: number): number =>
  (adds > 0 ? widthOf(`+${adds}`) : 0) +
  (adds > 0 && dels > 0 ? 1 : 0) +
  (dels > 0 ? widthOf(`−${dels}`) : 0)

function leftCellsOf(input: HeaderPlanInput, mapCells: number, notesText: string): number {
  const source = input.canPick
    ? SOURCE_CHROME_CELLS + Math.min(widthOf(input.sourceLabel), SOURCE_LABEL_MAX)
    : SOURCE_BUTTONS_CELLS
  const items = [
    GIT_ICON_CELLS,
    widthOf(countOf(input.fileCount, 'file')),
    statCellsOf(input.adds, input.dels),
    mapCells,
    DOT_CELLS,
    source,
    notesText === '' ? 0 : widthOf(notesText),
  ].filter(cells => cells > 0)
  return items.reduce((sum, cells) => sum + cells, 0) + ITEM_GAP * (items.length - 1)
}

/**
 * One row when the left cluster (git mark, counts, change map, `·`, source picker) plus every
 * chip as a bare icon fits `columns`; the map and the notes summary take the spare room. Otherwise
 * the two-row form (counts and source on top, map and chips below) the narrow-pane rulings were
 * built for.
 */
export function headerPlanOf(input: HeaderPlanInput): HeaderPlan {
  const chips = headerChipsOf({
    pending: input.pending,
    confirmingClear: input.confirmingClear,
    includeRefresh: true,
  })
  const floor = chipsIconsWidthOf(chips)
  const fits = (left: number) => left + ITEM_GAP + floor <= input.columns

  const mapMax = Math.min(input.fileCount, ONE_ROW_MAP_CELLS)
  const mapMin = Math.min(mapMax, MIN_MAP_CELLS)
  const notes =
    input.confirmingClear || input.pending === 0
      ? ''
      : iconText(NOTE_GLYPH, `${countOf(input.pending, 'note')} pending`)

  const sparse = leftCellsOf(input, mapMin, '')
  if (!fits(sparse)) return { rows: 2 }
  const full = leftCellsOf(input, mapMax, notes)
  if (fits(full)) return { rows: 1, mapCells: mapMax, notesText: notes, leftCells: full }
  return { rows: 1, mapCells: mapMin, notesText: '', leftCells: sparse }
}

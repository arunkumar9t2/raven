/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS, NOTE_STATE_COLORS } from '../../core/colors'
import type { Kit } from '../../core/view'
import type { Hunk } from '../../git/hunks'
import { type Comment, type CommentLine, changedLinesOf, lineKeyOf } from '../../review/comments'
import { ageOf } from '../../ui/age'
import { boxedCard, noteCard } from '../../ui/card'
import { type Chip, chipsFit } from '../../ui/chips'
import { BOXED_CELLS } from '../../ui/chrome'
import { iconText, NOTE_GLYPH } from '../../ui/icon-text'
import { pillRow } from '../../ui/strip'
import { widthOf } from '../../ui/wrap'
import {
  type Anchor,
  addressedKeyOf,
  cancelKeyOf,
  commentBoxKeyOf,
  commentButtonKeyOf,
  hunkHeaderKeyOf,
  noteKeyOf,
  revertKeyOf,
  selectKeyOf,
  stageKeyOf,
} from './anchor'
import { hunkLabelOf } from './hunk-label'
import {
  COMPOSE_PICKER_CELLS,
  composeLayoutOf,
  noteChipsOf,
  noteRowsOf,
  STATUS_WORDS,
} from './note-layout'
import { pickableLinesOf } from './split'

const WHOLE_HUNK = 'whole'

const lineValueOf = lineKeyOf

function lineOfValue(value: string, lines: readonly CommentLine[]): CommentLine | null {
  return lines.find(line => lineValueOf(line) === value) ?? null
}

/**
 * Cuts `text` to at most `max` terminal cells, marking the cut with an ellipsis. It cuts between
 * characters (never inside a surrogate pair) and counts a wide character as its display width.
 */
export function truncate(text: string, max: number): string {
  if (widthOf(text) <= max) return text
  let out = ''
  let used = 0
  for (const char of Array.from(text)) {
    const w = widthOf(char)
    if (used + w > max - 1) break
    out += char
    used += w
  }
  return `${out}…`
}

export type CommentBoxProps = {
  anchor: Anchor
  inputKey: string
  /** The anchor's hunk; present only for a hunk anchor, drives the line-picker Select. */
  hunk?: Hunk
  /**
   * Whether the line picker draws. The same value `blocksOf` used to size this block's rows, so
   * the row count and the drawing never disagree.
   */
  hasPicker: boolean
  /** The hunk draws side by side: the line picker offers new-side lines only. */
  isSplit?: boolean
  /** The Input's rows (`composeInputRowsOf`): 2 once its text has outgrown one row. */
  inputRows: 1 | 2
  /** The line chosen in the picker; null means "whole hunk". */
  line: CommentLine | null
  /** The box's own width, frame included: what `composeLayoutOf` lays out against. */
  columns: number
  /** The text typed so far, drawn into the Input again when the box remounts; empty when none. */
  draft?: string
  /** Runs on every change of the Input's text; the view keeps it as `draft` and sizes `inputRows` by it. */
  onInput?: (text: string) => void
  onLineChange: (line: CommentLine | null) => void
  onSubmit: (text: string) => void
  onCancel: () => void
}

/**
 * The compose box, the one frame on screen: `┌─ <note glyph> comment for Claude ──┐`, the interior on the
 * user-message fill, `└──┘` (`style.compose`: sharp, rounded under `rounded`). Its interior is one
 * row, `whole hunk ▾  <Input>  ✕ cancel` (the Input draws its own `⏎ add`), until the pane is too
 * narrow: then the picker takes a row above the Input and the cancel pill a row below
 * (`composeLayoutOf`). `blocksOf` emits this block only while the anchor is being composed and
 * only on a surface with `canType`, so this always runs with a real `Input` to draw; the idle
 * note control is `noteChip`, drawn by the title or the hunk's label row instead.
 */
export function commentBox(kit: Kit, props: CommentBoxProps): RenderElement {
  const { Box, Input, Select, Text } = kit.ui
  const { anchor } = props
  const innerWidth = Math.max(1, props.columns - BOXED_CELLS)
  const layout = composeLayoutOf(props.hasPicker, innerWidth, props.inputRows)

  const lines = props.hunk
    ? pickableLinesOf(changedLinesOf(props.hunk), props.isSplit ?? false)
    : []
  // Inline, the selected label must stay inside the picker's cells; on its own row it may use the room.
  const maxLabelLen = layout.pickerRow ? Math.max(8, innerWidth - 12) : COMPOSE_PICKER_CELLS - 4
  const options = [
    { value: WHOLE_HUNK, label: 'whole hunk' },
    ...lines.map(line => ({
      value: lineValueOf(line),
      label: truncate(
        `L${line.number} ${line.side === 'old' ? '-' : '+'} ${line.text}`,
        maxLabelLen,
      ),
    })),
  ]

  const picker = props.hasPicker ? (
    <Box flexShrink={0}>
      <Select
        key={selectKeyOf(anchor)}
        options={options}
        value={props.line ? lineValueOf(props.line) : WHOLE_HUNK}
        onSelect={value => props.onLineChange(lineOfValue(value, lines))}
      />
    </Box>
  ) : null
  const input = (
    <Box flexGrow={1} flexShrink={1} overflow="hidden">
      <Input
        key={props.inputKey}
        autoFocus
        placeholder="Your comment for Claude…"
        value={props.draft || undefined}
        submitLabel="add"
        onInput={text => props.onInput?.(text)}
        onSubmit={text => props.onSubmit(text)}
      />
    </Box>
  )
  const cancel = (
    <Box flexShrink={0}>
      {pillRow(
        kit,
        [{ key: cancelKeyOf(anchor), icon: '✕', label: 'cancel', onPress: props.onCancel }],
        'words',
        commentBoxKeyOf(anchor),
      )}
    </Box>
  )

  return boxedCard(kit, {
    color: COLORS.accent,
    frame: kit.style.compose,
    title: (
      <Text color={COLORS.accent} bold wrap="truncate-end">
        {iconText(NOTE_GLYPH, 'comment for Claude')}
      </Text>
    ),
    rows: layout.inner,
    children: (
      <Box flexDirection="column">
        {layout.pickerRow ? picker : null}
        <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
          {layout.pickerRow ? null : picker}
          {input}
          {layout.actionsRow ? null : cancel}
        </Box>
        {layout.actionsRow ? cancel : null}
      </Box>
    ),
  })
}

/**
 * A note: a `┃ ` bar in the status colour on the user-message fill (`noteCard`), no frame. Its
 * first row is the header, `● pending · L5 · 2m` with the pills (`resend` when open, `✕`)
 * right-aligned; the rows below are `lines` (from `noteLinesOf`, wrapped once by whoever sized
 * the note). `now` (ms) comes from the view's own clock, never `Date.now()` here.
 */
export function note(
  kit: Kit,
  comment: Comment,
  lines: readonly string[],
  now: number,
  onRemove: (id: string) => void,
  onResend: () => void,
): RenderElement {
  const { Box, Text } = kit.ui
  const lineLabel = comment.line ? `L${comment.line.number}` : ''
  const color = NOTE_STATE_COLORS[comment.status]
  const scope = noteKeyOf(comment.id)
  const word =
    comment.status === 'addressed' ? STATUS_WORDS.addressed : `● ${STATUS_WORDS[comment.status]}`
  const title = (
    // One truncating Text, not two siblings in a row: the header is always one row, however narrow.
    <Box key={scope} overflow="hidden">
      <Text wrap="truncate-end">
        <Text color={color}>{word}</Text>
        <Text
          dimColor
        >{` · ${[lineLabel, ageOf(comment.createdAt, now)].filter(Boolean).join(' · ')}`}</Text>
      </Text>
    </Box>
  )
  return noteCard(kit, {
    color,
    rows: noteRowsOf(lines.length),
    children: (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2} overflow="hidden" flexWrap="nowrap">
          <Box flexShrink={1} overflow="hidden">
            {title}
          </Box>
          <Box flexGrow={1} />
          <Box flexShrink={0}>
            {pillRow(kit, noteChipsOf(comment, onRemove, onResend), 'words', scope)}
          </Box>
        </Box>
        {lines.map((line, index) => (
          <Box key={`${scope}:${index}`}>
            <Text wrap="truncate-end">{line}</Text>
          </Box>
        ))}
      </Box>
    ),
  })
}

/**
 * The "<note glyph> note" chip descriptor: the one place that builds it and its key, used by a file's
 * heading and a hunk's toolbar alike. Never drawn for an anchor already being composed; its
 * caller omits this in that case, leaving room for the compose box below.
 */
export function noteChip(anchor: Anchor, onStart: (anchor: Anchor) => void): Chip {
  return {
    key: commentButtonKeyOf(anchor),
    icon: NOTE_GLYPH,
    label: 'note',
    onPress: () => onStart(anchor),
  }
}

export type HunkToolbarProps = {
  anchor: Anchor
  /** The file's path: prose files show no function context. */
  path: string
  hunk: Hunk
  /** Whether the "<note glyph> note" chip draws: the surface can type and this hunk isn't being composed. */
  canNote: boolean
  /** A turn's diff is read-only: the row draws the header label alone, no chips. */
  isReadOnly: boolean
  isStaged: boolean
  confirmingRevert: boolean
  /** The label row's own room, after the rail: what `chipsFit` sizes against. */
  columns: number
  onStartNote: (anchor: Anchor) => void
  onStage: () => void
  onRevert: () => void
}

/**
 * Room `chipsFit` leaves for the header label before shrinking its chips to icons, shared by
 * the hunk label row and (via `diff-view.tsx`'s title row) the file title, so both shrink their
 * chips the same way under the same pressure.
 */
export const HEADER_MIN = 12

/** The cells between a hunk's label and its chips. */
const LABEL_CHIP_GAP = 2

/**
 * A hunk's label row, `ƒ name  L1–7   <note glyph> note  ✓ stage  ↺ revert`: a plain row, no rule. The
 * chips sit two columns after the label (never at the pane's edge); unless the hunk is
 * read-only they are the note (when it can draw), stage and revert pills. Staging is a no-op once
 * staged (the pill reads "staged", kind on); revert confirms on a second press, keeping its words
 * (`↺ sure?`, kind armed) even when the pills shrink to bare icons to fit. D12 §2-3.
 */
export function hunkToolbar(kit: Kit, props: HunkToolbarProps): RenderElement {
  const { Box, Text } = kit.ui
  const { anchor } = props
  const label = hunkLabelOf(props.hunk, props.path)
  const key = hunkHeaderKeyOf(anchor)
  const left = (
    <Text wrap="truncate-end" key={key}>
      {label}
    </Text>
  )

  if (props.isReadOnly) return left

  const chips: Chip[] = []
  if (props.canNote) chips.push(noteChip(anchor, props.onStartNote))
  chips.push({
    key: stageKeyOf(anchor),
    icon: '✓',
    label: props.isStaged ? 'staged' : 'stage',
    kind: props.isStaged ? 'on' : 'normal',
    onPress: props.isStaged ? () => {} : props.onStage,
  })
  chips.push({
    key: revertKeyOf(anchor),
    icon: '↺',
    label: props.confirmingRevert ? 'sure?' : 'revert',
    kind: props.confirmingRevert ? 'armed' : 'danger',
    forceWords: props.confirmingRevert,
    onPress: props.onRevert,
  })

  const room = Math.max(0, props.columns - HEADER_MIN - LABEL_CHIP_GAP)
  return (
    <Box flexDirection="row" gap={LABEL_CHIP_GAP} overflow="hidden" flexWrap="nowrap">
      <Box flexShrink={1} overflow="hidden">
        {left}
      </Box>
      <Box flexShrink={0}>{pillRow(kit, chips, chipsFit(chips, room), key)}</Box>
    </Box>
  )
}

/** The collapsed row for an anchor's addressed comments: "✓ N addressed". */
export function addressedRow(kit: Kit, anchor: Anchor, count: number): RenderElement {
  const { Text } = kit.ui
  return (
    <Text key={addressedKeyOf(anchor)} dimColor>
      ✓ {count} addressed
    </Text>
  )
}

/** The plain dim heading above the diff's outdated-comments group (both panes). */
export function outdatedHeading(kit: Kit): RenderElement {
  const { Text } = kit.ui
  return <Text dimColor>Outdated</Text>
}

/** The plain dim heading above the group for comments whose path matches no file in the stream. */
export function orphansTitle(kit: Kit): RenderElement {
  const { Text } = kit.ui
  return <Text dimColor>Not in this diff</Text>
}

/** An orphaned path's own heading row, always one row: the path (it truncates first), plus a dim "file gone" when it no longer exists. */
export function orphanPathRow(kit: Kit, path: string, isGone: boolean): RenderElement {
  const { Box, Text } = kit.ui
  return (
    <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
      <Box flexShrink={1} overflow="hidden">
        <Text bold wrap="truncate-end">
          {path}
        </Text>
      </Box>
      {isGone ? (
        <Box flexShrink={0}>
          <Text dimColor wrap="truncate-end">
            file gone
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}

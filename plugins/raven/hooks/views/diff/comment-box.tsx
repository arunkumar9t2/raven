/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { NOTE_STATE_COLORS } from '../../core/colors'
import type { Kit } from '../../core/view'
import { type Hunk, parseHeader } from '../../git/hunks'
import { type Comment, type CommentLine, changedLinesOf } from '../../review/comments'
import { accentBar } from '../../ui/accent-bar'
import { ageOf } from '../../ui/age'
import { type Chip, chipRow, chipsFit } from '../../ui/chips'
import { meta } from '../../ui/meta'
import { row } from '../../ui/row'
import {
  type Anchor,
  addressedKeyOf,
  cancelKeyOf,
  commentButtonKeyOf,
  dropKeyOf,
  hunkHeaderKeyOf,
  noteKeyOf,
  resendKeyOf,
  revertKeyOf,
  selectKeyOf,
  stageKeyOf,
} from './anchor'

const WHOLE_HUNK = 'whole'

const lineValueOf = (line: CommentLine) => `${line.side}:${line.number}`

function lineOfValue(value: string, lines: readonly CommentLine[]): CommentLine | null {
  return lines.find(line => lineValueOf(line) === value) ?? null
}

/** Cuts `text` to at most `max` chars, marking the cut with an ellipsis. */
function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}

export type CommentBoxProps = {
  anchor: Anchor
  inputKey: string
  /** The anchor's hunk; present only for a hunk anchor, drives the line-picker Select. */
  hunk?: Hunk
  /**
   * Whether the line-picker Select draws, above the Input — the same value `blocksOf` used to
   * size this block's rows, so the row count and the drawing never disagree.
   */
  hasPicker: boolean
  /** The line chosen in the picker; null means "whole hunk". */
  line: CommentLine | null
  columns: number
  onLineChange: (line: CommentLine | null) => void
  onSubmit: (text: string) => void
  onCancel: () => void
}

/**
 * The compose state for an anchor being written to: a line picker (on a hunk, when `hasPicker`)
 * plus an Input+cancel pair. `blocksOf` emits this block only while the anchor is being composed
 * and only on a surface with `canType`, so this always runs with a real `Input` to draw; the
 * idle "✎ note" control is `noteChip`, drawn by the heading or the hunk's toolbar instead.
 */
export function commentBox(kit: Kit, props: CommentBoxProps): RenderElement {
  const { Box, Button, Input, Select } = kit.ui
  const { anchor } = props

  const lines = props.hunk ? changedLinesOf(props.hunk) : []
  // Leaves room for "Lnnn ± " and the Select's own chrome (label, current value marker).
  const maxLabelLen = Math.max(8, props.columns - 12)
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

  return (
    <Box flexDirection="column">
      {props.hasPicker ? (
        <Select
          key={selectKeyOf(anchor)}
          options={options}
          value={props.line ? lineValueOf(props.line) : WHOLE_HUNK}
          onSelect={value => props.onLineChange(lineOfValue(value, lines))}
        />
      ) : null}
      <Input
        key={props.inputKey}
        autoFocus
        placeholder="Your comment for Claude…"
        submitLabel="add"
        onSubmit={text => props.onSubmit(text)}
      />
      <Button key={cancelKeyOf(anchor)} plain dimColor label="cancel" onPress={props.onCancel} />
    </Box>
  )
}

/**
 * A note reads as a margin annotation under its code: `accentBar` coloured by its status, the
 * text, then a dim `L<line> · <age>` and its chips, right-aligned — D10 point 6. `now` (ms) comes
 * from the view's own clock, never `Date.now()` here.
 */
export function note(
  kit: Kit,
  comment: Comment,
  now: number,
  onRemove: (id: string) => void,
  onResend: () => void,
): RenderElement {
  const { Box, Text } = kit.ui
  const lineLabel = comment.line ? `L${comment.line.number}` : ''
  const age = ageOf(comment.createdAt, now)

  const chips: Chip[] = []
  if (comment.status === 'open') {
    chips.push({
      key: resendKeyOf(comment.id),
      icon: '',
      label: 'resend',
      isDim: true,
      onPress: onResend,
    })
  }
  chips.push({
    key: dropKeyOf(comment.id),
    icon: '✕',
    label: '',
    isDim: true,
    onPress: () => onRemove(comment.id),
  })

  const left = (
    <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
      {accentBar(kit, NOTE_STATE_COLORS[comment.status])}
      <Text wrap="truncate-end">{comment.text}</Text>
    </Box>
  )
  const right = (
    <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
      {meta(kit, [lineLabel, age])}
      {chipRow(kit, chips, 'words')}
    </Box>
  )
  return row(kit, { left, right, key: noteKeyOf(comment.id) })
}

/**
 * The "✎ note" chip descriptor: the one place that builds it and its key, used by a file's
 * heading and a hunk's toolbar alike. Never drawn for an anchor already being composed — its
 * caller omits this in that case, leaving room for the compose box below.
 */
export function noteChip(anchor: Anchor, onStart: (anchor: Anchor) => void): Chip {
  return {
    key: commentButtonKeyOf(anchor),
    icon: '✎',
    label: 'note',
    isDim: true,
    onPress: () => onStart(anchor),
  }
}

export type HunkToolbarProps = {
  anchor: Anchor
  hunk: Hunk
  /** Whether the "✎ note" chip draws: the surface can type and this hunk isn't being composed. */
  canNote: boolean
  /** A turn's diff is read-only: the row draws the header label alone, no chips. */
  isReadOnly: boolean
  isStaged: boolean
  confirmingRevert: boolean
  /** The toolbar's own room, after the rail and its indent — what `chipsFit` sizes against. */
  columns: number
  onStartNote: (anchor: Anchor) => void
  onStage: () => void
  onRevert: () => void
}

/** Room `chipsFit` leaves for the header label before shrinking the chips to icons. */
const HEADER_MIN = 12

/**
 * A hunk's function context and its new-side line range — `ƒ handleRequest  L2–8`, or the bare
 * range when git gives no context (a trailing `{`/`(` off a long suffix is dropped). D10 point 3.
 */
function hunkLabelOf(hunk: Hunk): string {
  const parsed = parseHeader(hunk.header)
  if (!parsed) return ''
  const range = `L${parsed.newStart}–${parsed.newStart + Math.max(0, parsed.newCount - 1)}`
  const suffix = parsed.suffix
    .trim()
    .replace(/[{(]+$/, '')
    .trim()
  return suffix === '' ? range : `ƒ ${suffix}  ${range}`
}

/**
 * A hunk's toolbar row: its header label, then — unless read-only — the note (when it can draw),
 * stage and revert chips, right-aligned. Staging is a no-op once staged; revert confirms on a
 * second press, keeping its words (`↺ sure?`) even in icons mode. D10 points 3 and 5.
 */
export function hunkToolbar(kit: Kit, props: HunkToolbarProps): RenderElement {
  const { anchor } = props
  const label = hunkLabelOf(props.hunk)

  if (props.isReadOnly) return row(kit, { left: label, key: hunkHeaderKeyOf(anchor) })

  const chips: Chip[] = []
  if (props.canNote) chips.push(noteChip(anchor, props.onStartNote))
  chips.push({
    key: stageKeyOf(anchor),
    icon: '✓',
    label: props.isStaged ? 'staged' : 'stage',
    isDim: !props.isStaged,
    onPress: props.isStaged ? () => {} : props.onStage,
  })
  chips.push({
    key: revertKeyOf(anchor),
    icon: '↺',
    label: props.confirmingRevert ? 'sure?' : 'revert',
    isDim: !props.confirmingRevert,
    forceWords: props.confirmingRevert,
    onPress: props.onRevert,
  })

  const room = Math.max(0, props.columns - HEADER_MIN)
  const mode = chipsFit(chips, room)

  return row(kit, { left: label, right: chipRow(kit, chips, mode), key: hunkHeaderKeyOf(anchor) })
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

/** The dim title row above the outdated-comments group. */
export function outdatedTitle(kit: Kit): RenderElement {
  const { Text } = kit.ui
  return <Text dimColor>Outdated</Text>
}

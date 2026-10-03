/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS, NOTE_STATE_COLORS } from '../../core/colors'
import type { Kit } from '../../core/view'
import { type Hunk, parseHeader } from '../../git/hunks'
import { type Comment, type CommentLine, changedLinesOf } from '../../review/comments'
import { ageOf } from '../../ui/age'
import { type Chip, chipRow, chipsFit } from '../../ui/chips'
import { meta } from '../../ui/meta'
import { row } from '../../ui/row'
import {
  type Anchor,
  addressedKeyOf,
  cancelKeyOf,
  commentBoxKeyOf,
  commentButtonKeyOf,
  dropKeyOf,
  hunkHeaderKeyOf,
  noteKeyOf,
  resendKeyOf,
  revertKeyOf,
  selectKeyOf,
  stageKeyOf,
} from './anchor'
import { barOf, composeRowsOf, noteLinesOf, STATUS_WORDS } from './note-layout'

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
  /** The rows the Input's text wraps to (the bar spans them); 1 when omitted. */
  inputRows?: number
  /** The line chosen in the picker; null means "whole hunk". */
  line: CommentLine | null
  columns: number
  onLineChange: (line: CommentLine | null) => void
  /** Every change of the Input's text; the diff pane sizes the box's rows from it. */
  onInput?: (text: string) => void
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
  const { Box, Input, Select, Text } = kit.ui
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

  const hint = (
    <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
      <Text dimColor>⏎ add</Text>
      {chipRow(
        kit,
        [
          {
            key: cancelKeyOf(anchor),
            icon: '✕',
            label: 'cancel',
            isDim: true,
            onPress: props.onCancel,
          },
        ],
        'words',
        commentBoxKeyOf(anchor),
      )}
    </Box>
  )

  const rows = composeRowsOf(props.hasPicker, props.inputRows)
  return (
    <Box
      flexDirection="row"
      flexGrow={1}
      gap={1}
      overflow="hidden"
      flexWrap="nowrap"
      backgroundColor={COLORS.userMessage}
    >
      <Text color={COLORS.suggestion}>{barOf(rows)}</Text>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
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
          onInput={props.onInput}
          onSubmit={text => props.onSubmit(text)}
        />
        {hint}
      </Box>
    </Box>
  )
}

/**
 * A note is a card: a heavy `┃` in its status colour down every row, row 1 the comment's first
 * line with — right-aligned — the status word, a dim `L<line> · <age>` and the chips; the rest of
 * the text follows on rows 2..n, wrapped to `width` (the card's whole room), at most
 * `NOTE_MAX_ROWS`. `noteLinesOf` is the one wrap, shared with `blocksOf`'s row count. `now` (ms)
 * comes from the view's own clock, never `Date.now()` here.
 */
export function note(
  kit: Kit,
  comment: Comment,
  now: number,
  onRemove: (id: string) => void,
  onResend: () => void,
  width: number,
): RenderElement {
  const { Box, Text } = kit.ui
  const lineLabel = comment.line ? `L${comment.line.number}` : ''
  const age = ageOf(comment.createdAt, now)
  const color = NOTE_STATE_COLORS[comment.status]

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

  const lines = noteLinesOf(comment, width)
  const scope = noteKeyOf(comment.id)
  const right = (
    <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
      <Text color={color}>{STATUS_WORDS[comment.status]}</Text>
      {meta(kit, [lineLabel, age])}
      {chipRow(kit, chips, 'words', scope)}
    </Box>
  )
  return (
    <Box
      flexDirection="row"
      flexGrow={1}
      gap={1}
      overflow="hidden"
      flexWrap="nowrap"
      backgroundColor={COLORS.userMessage}
    >
      <Text color={color}>{barOf(lines.length)}</Text>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {row(kit, {
          left: <Text wrap="truncate-end">{lines[0] ?? ''}</Text>,
          right,
          key: scope,
        })}
        {lines.slice(1).map((line, index) => (
          <Box key={`${scope}:${index}`}>
            <Text wrap="truncate-end">{line}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  )
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

/**
 * Room `chipsFit` leaves for the header label before shrinking its chips to icons — shared by
 * the hunk toolbar and (via `diff-view.tsx`'s title row) the file heading, so both shrink their
 * chips the same way under the same pressure.
 */
export const HEADER_MIN = 12

/**
 * A hunk's function context and its new-side line range — `ƒ handleRequest  L2–8`, or the bare
 * range when git gives no context (a trailing `{`/`(` off a long suffix is dropped). D10 point 3.
 *
 * The strip is unconditional, not gated on the suffix's length: git only ever puts one context
 * line there, so a trailing brace/paren is always the same kind of artefact (an opening brace a
 * function/block signature got cut on) regardless of how long that line happens to be — there is
 * no length past which it stops being one.
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
  const key = hunkHeaderKeyOf(anchor)

  if (props.isReadOnly) return row(kit, { left: label, key })

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

  return row(kit, { left: label, right: chipRow(kit, chips, mode, key), key })
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

/** The dim title row above the group for comments whose path matches no file in the stream. */
export function orphansTitle(kit: Kit): RenderElement {
  const { Text } = kit.ui
  return <Text dimColor>Not in this diff</Text>
}

/** An orphaned path's own heading row: the path, plus a dim "file gone" when it no longer exists. */
export function orphanPathRow(kit: Kit, path: string, isGone: boolean): RenderElement {
  const { Box, Text } = kit.ui
  return (
    <Box flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
      <Text bold wrap="truncate-end">
        {path}
      </Text>
      {isGone ? <Text dimColor>file gone</Text> : null}
    </Box>
  )
}

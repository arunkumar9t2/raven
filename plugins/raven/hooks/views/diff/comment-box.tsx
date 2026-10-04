/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS, NOTE_STATE_COLORS } from '../../core/colors'
import type { Kit } from '../../core/view'
import { type Hunk, parseHeader } from '../../git/hunks'
import { type Comment, type CommentLine, changedLinesOf, lineKeyOf } from '../../review/comments'
import { ageOf } from '../../ui/age'
import { boxedCard, ruleRow } from '../../ui/card'
import { type Chip, chipsFit } from '../../ui/chips'
import { RULE_START, ruleRoomFor } from '../../ui/chrome'
import { pillRow } from '../../ui/strip'
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
import { composeInnerRowsOf, noteChipsOf, STATUS_WORDS } from './note-layout'

const WHOLE_HUNK = 'whole'

const lineValueOf = lineKeyOf

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
      {pillRow(
        kit,
        [
          {
            key: cancelKeyOf(anchor),
            icon: '✕',
            label: 'cancel',
            onPress: props.onCancel,
          },
        ],
        'words',
        commentBoxKeyOf(anchor),
      )}
    </Box>
  )

  return boxedCard(kit, {
    color: COLORS.accent,
    title: (
      <Text color={COLORS.accent} bold wrap="truncate-end">
        ✎ comment for Claude
      </Text>
    ),
    rows: composeInnerRowsOf(props.hasPicker),
    children: (
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
        {hint}
      </Box>
    ),
  })
}

/**
 * A note is a boxed card: `╭─ ● pending · L5 · now ─────── ✕ ─╮` — the status word in its colour,
 * a dim `L<line> · <age>`, and the pills embedded in the top border — then `│ text │` rows (`lines`,
 * from `noteLinesOf`, wrapped once by whoever sized the card) and `╰──╯`. The border is the
 * status colour, the inside the user-message tint. `now` (ms) comes from the view's own clock,
 * never `Date.now()` here.
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
    <Box key={scope} flexDirection="row" overflow="hidden" flexWrap="nowrap">
      <Text color={color} wrap="truncate-end">
        {word}
      </Text>
      <Text
        dimColor
      >{` · ${[lineLabel, ageOf(comment.createdAt, now)].filter(Boolean).join(' · ')}`}</Text>
    </Box>
  )
  return boxedCard(kit, {
    color,
    title,
    right: pillRow(kit, noteChipsOf(comment, onRemove, onResend), 'words', scope),
    rows: lines.length,
    children: (
      <Box flexDirection="column">
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
 * The "✎ note" chip descriptor: the one place that builds it and its key, used by a file's
 * heading and a hunk's toolbar alike. Never drawn for an anchor already being composed — its
 * caller omits this in that case, leaving room for the compose box below.
 */
export function noteChip(anchor: Anchor, onStart: (anchor: Anchor) => void): Chip {
  return {
    key: commentButtonKeyOf(anchor),
    icon: '✎',
    label: 'note',
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
  /** The toolbar's own room, after the rail — what `chipsFit` sizes against. */
  columns: number
  /** The file card's border colour: status, or the accent while Claude edits the file. */
  color: string
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
 * A hunk's toolbar row, `├─ ƒ name  L1–7 ─────── pills`: the border in the file card's `color`,
 * the header label, a fill, then — unless read-only — the note (when it can draw), stage and
 * revert pills at the right. Staging is a no-op once staged (the pill reads "staged", kind on);
 * revert confirms on a second press, keeping its words (`↺ sure?`, kind armed) even when the pills
 * shrink to bare icons to fit. D12 §2–3.
 */
export function hunkToolbar(kit: Kit, props: HunkToolbarProps): RenderElement {
  const { Text } = kit.ui
  const { anchor, color } = props
  const label = hunkLabelOf(props.hunk)
  const key = hunkHeaderKeyOf(anchor)
  const left = (
    <Text wrap="truncate-end" key={key}>
      {label}
    </Text>
  )

  if (props.isReadOnly) return ruleRow(kit, { color, start: RULE_START.branch, left })

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

  const room = ruleRoomFor(props.columns, HEADER_MIN)
  return ruleRow(kit, {
    color,
    start: RULE_START.branch,
    left,
    right: pillRow(kit, chips, chipsFit(chips, room), key),
  })
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

/** A group's separator rule, `├─ title ────`, in the calm border colour. */
function groupRule(kit: Kit, title: string): RenderElement {
  const { Text } = kit.ui
  return ruleRow(kit, {
    color: COLORS.subtle,
    start: RULE_START.branch,
    left: <Text dimColor>{title}</Text>,
  })
}

/** The rule above the outdated-comments group (both panes). */
export function outdatedTitle(kit: Kit): RenderElement {
  return groupRule(kit, 'Outdated')
}

/** The rule above the group for comments whose path matches no file in the stream. */
export function orphansTitle(kit: Kit): RenderElement {
  return groupRule(kit, 'Not in this diff')
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

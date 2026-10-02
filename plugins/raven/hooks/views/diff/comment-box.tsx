/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../../core/colors'
import type { Kit } from '../../core/view'
import type { Hunk } from '../../git/hunks'
import { type Comment, type CommentLine, changedLinesOf } from '../../review/comments'
import {
  type Anchor,
  addressedKeyOf,
  cancelKeyOf,
  commentButtonKeyOf,
  dropKeyOf,
  hunkActionsKeyOf,
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
 * idle "＋ note" control is `noteButton`, drawn by the heading or the hunk's actions row instead.
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

/** One existing comment: pending plain, sent dim with `⧗`, open with `↻` and a resend button. */
export function note(
  kit: Kit,
  comment: Comment,
  onRemove: (id: string) => void,
  onResend: () => void,
): RenderElement {
  const { Box, Text, Button } = kit.ui
  const isDim = comment.status === 'sent' || comment.status === 'open'
  const prefix = comment.status === 'sent' ? '⧗ ' : comment.status === 'open' ? '↻ ' : ''
  const lineLabel = comment.line ? `L${comment.line.number} ` : ''

  return (
    <Box key={noteKeyOf(comment.id)} flexDirection="row" gap={1}>
      <Text color={isDim ? undefined : COLORS.suggestion} dimColor={isDim} wrap="truncate-end">
        ▍ {prefix}
        {lineLabel}
        {comment.text}
      </Text>
      {comment.status === 'open' ? (
        <Button key={resendKeyOf(comment.id)} plain dimColor label="resend" onPress={onResend} />
      ) : null}
      <Button
        key={dropKeyOf(comment.id)}
        plain
        dimColor
        label="✕"
        onPress={() => onRemove(comment.id)}
      />
    </Box>
  )
}

/**
 * The idle "＋ note" control: the one place that builds the button and its key, drawn by a
 * file's heading row or a hunk's actions row. Never drawn for an anchor already being composed —
 * its caller omits this in that case, leaving room for the compose box below.
 */
export function noteButton(
  kit: Kit,
  anchor: Anchor,
  label: string,
  onStart: (anchor: Anchor) => void,
): RenderElement {
  const { Button } = kit.ui
  return (
    <Button
      key={commentButtonKeyOf(anchor)}
      plain
      dimColor
      label={label}
      onPress={() => onStart(anchor)}
    />
  )
}

export type HunkActionsProps = {
  anchor: Anchor
  /** Whether the "＋ note on hunk" control draws: the surface can type and this hunk isn't being composed. */
  canNote: boolean
  isStaged: boolean
  confirmingRevert: boolean
  onStartNote: (anchor: Anchor) => void
  onStage: () => void
  onRevert: () => void
}

/**
 * A hunk's one row of controls: ＋ note on hunk (when it can draw), stage, revert — each pair
 * separated by a dim `·`. Staging is a no-op once staged, revert confirms on a second press.
 */
export function hunkActionsRow(kit: Kit, props: HunkActionsProps): RenderElement {
  const { Box, Text, Button } = kit.ui
  const { anchor } = props
  return (
    <Box
      key={hunkActionsKeyOf(anchor)}
      flexDirection="row"
      gap={1}
      overflow="hidden"
      flexWrap="nowrap"
    >
      {props.canNote ? noteButton(kit, anchor, '＋ note on hunk', props.onStartNote) : null}
      {props.canNote ? <Text dimColor>·</Text> : null}
      <Button
        key={stageKeyOf(anchor)}
        plain
        dimColor
        label={props.isStaged ? 'staged ✓' : 'stage'}
        onPress={props.isStaged ? () => {} : props.onStage}
      />
      <Text dimColor>·</Text>
      {props.confirmingRevert ? (
        <Button
          key={revertKeyOf(anchor)}
          plain
          label="revert? press again"
          onPress={props.onRevert}
        />
      ) : (
        <Button key={revertKeyOf(anchor)} plain dimColor label="revert" onPress={props.onRevert} />
      )}
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

/** The dim title row above the outdated-comments group. */
export function outdatedTitle(kit: Kit): RenderElement {
  const { Text } = kit.ui
  return <Text dimColor>Outdated</Text>
}

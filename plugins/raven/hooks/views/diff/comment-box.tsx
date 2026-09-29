/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

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
  sameAnchor,
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
  composing: Anchor | null
  inputKey: string
  /** The anchor's hunk; present only for a hunk anchor, drives the line-picker Select. */
  hunk?: Hunk
  /** The line chosen in the picker; null means "whole hunk". */
  line: CommentLine | null
  columns: number
  /** The "＋ comment" button's hotkey, when this is the anchor it should trigger. */
  hotkey?: string
  onStart: (anchor: Anchor) => void
  onLineChange: (line: CommentLine | null) => void
  onSubmit: (text: string) => void
  onCancel: () => void
}

/**
 * The "＋ comment" button, swapped for a line picker (on a hunk) plus an Input+cancel pair once
 * this anchor is being composed.
 */
export function commentBox(kit: Kit, props: CommentBoxProps): RenderElement {
  const { Box, Button, Input, Select } = kit.ui
  const { anchor } = props

  if (!sameAnchor(props.composing, anchor)) {
    return (
      <Button
        key={commentButtonKeyOf(anchor)}
        plain
        dimColor
        hotkey={props.hotkey}
        label={anchor.hunk ? '＋ comment on this hunk' : '＋ comment on this file'}
        onPress={() => props.onStart(anchor)}
      />
    )
  }

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
      {props.hunk ? (
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
      <Text color={isDim ? undefined : '#e0af68'} dimColor={isDim} wrap="truncate-end">
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

export type HunkActionsProps = {
  anchor: Anchor
  isStaged: boolean
  confirmingRevert: boolean
  onStage: () => void
  onRevert: () => void
}

/** A hunk's stage/revert row: staging is a no-op once staged, revert confirms on a second press. */
export function hunkActionsRow(kit: Kit, props: HunkActionsProps): RenderElement {
  const { Box, Button } = kit.ui
  const { anchor } = props
  return (
    <Box key={hunkActionsKeyOf(anchor)} flexDirection="row" gap={1}>
      <Button
        key={stageKeyOf(anchor)}
        plain
        dimColor
        label={props.isStaged ? 'staged ✓' : 'stage'}
        onPress={props.isStaged ? () => {} : props.onStage}
      />
      <Button
        key={revertKeyOf(anchor)}
        plain
        dimColor
        label={props.confirmingRevert ? 'revert? (again)' : 'revert'}
        onPress={props.onRevert}
      />
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

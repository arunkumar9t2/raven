/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../../core/view'
import type { Comment } from '../../review/comments'
import {
  type Anchor,
  cancelKeyOf,
  commentButtonKeyOf,
  dropKeyOf,
  noteKeyOf,
  sameAnchor,
} from './anchor'

export type CommentBoxProps = {
  anchor: Anchor
  composing: Anchor | null
  inputKey: string
  onStart: (anchor: Anchor) => void
  onSubmit: (text: string) => void
  onCancel: () => void
}

/** The "＋ comment" button, swapped for an Input+cancel pair once this anchor is being composed. */
export function commentBox(kit: Kit, props: CommentBoxProps): RenderElement {
  const { Box, Button, Input } = kit.ui
  const { anchor } = props

  if (!sameAnchor(props.composing, anchor)) {
    return (
      <Button
        key={commentButtonKeyOf(anchor)}
        plain
        dimColor
        label={anchor.hunk ? '＋ comment on this hunk' : '＋ comment on this file'}
        onPress={() => props.onStart(anchor)}
      />
    )
  }

  return (
    <Box flexDirection="column">
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

/** One existing comment, with a button to remove it. */
export function note(kit: Kit, comment: Comment, onRemove: (id: string) => void): RenderElement {
  const { Box, Text, Button } = kit.ui
  return (
    <Box key={noteKeyOf(comment.id)} flexDirection="row" gap={1}>
      <Text color="#e0af68" wrap="truncate-end">
        ▍ {comment.text}
      </Text>
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

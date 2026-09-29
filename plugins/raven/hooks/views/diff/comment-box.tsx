/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../../core/view'
import { type Comments, commentsOn } from '../../review/comments'
import { type Anchor, sameAnchor } from './anchor'

export type { Anchor } from './anchor'
export { sameAnchor } from './anchor'

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
  const key = `${anchor.path}|${anchor.hunk ?? ''}`

  if (!sameAnchor(props.composing, anchor)) {
    return (
      <Button
        key={`comment:${key}`}
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
      <Button key={`cancel:${key}`} plain dimColor label="cancel" onPress={props.onCancel} />
    </Box>
  )
}

export type NotesProps = {
  anchor: Anchor
  comments: Comments
  onRemove: (id: string) => void
}

/** The existing comments anchored to a file or hunk, each with a remove button. */
export function notes(kit: Kit, props: NotesProps): RenderElement[] {
  const { Box, Text, Button } = kit.ui
  return commentsOn(props.comments, props.anchor.path, props.anchor.hunk).map(comment => (
    <Box key={`note:${comment.id}`} flexDirection="row" gap={1}>
      <Text color="#e0af68" wrap="truncate-end">
        ▍ {comment.text}
      </Text>
      <Button
        key={`drop:${comment.id}`}
        plain
        dimColor
        label="✕"
        onPress={() => props.onRemove(comment.id)}
      />
    </Box>
  ))
}

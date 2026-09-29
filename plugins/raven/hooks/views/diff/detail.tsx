/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../../core/view'
import type { ChangedFile } from '../../git/changes'
import { clampHunk, type Hunk } from '../../git/hunks'
import type { Comments } from '../../review/comments'
import { type Anchor, commentBox, notes } from './comment-box'

export type DetailProps = {
  file: ChangedFile
  hunks: readonly Hunk[] | undefined
  comments: Comments
  composing: Anchor | null
  inputKeyOf: (anchor: Anchor) => string
  onStartComposing: (anchor: Anchor) => void
  onSubmitComment: (anchor: Anchor, text: string) => void
  onCancelComposing: () => void
  onRemoveComment: (id: string) => void
}

/** The selected file's title, its file-level comments, and each hunk with its own comments. */
export function detail(kit: Kit, props: DetailProps): RenderElement {
  const { Box, Text, Code } = kit.ui
  const { file, hunks } = props

  const anchorAt = (hunk?: string): Anchor => ({ path: file.path, hunk })

  const notesAt = (anchor: Anchor) =>
    notes(kit, { anchor, comments: props.comments, onRemove: props.onRemoveComment })

  const commentBoxAt = (anchor: Anchor) =>
    commentBox(kit, {
      anchor,
      composing: props.composing,
      inputKey: props.inputKeyOf(anchor),
      onStart: props.onStartComposing,
      onSubmit: text => props.onSubmitComment(anchor, text),
      onCancel: props.onCancelComposing,
    })

  return (
    <Box flexDirection="column" gap={1}>
      <Text bold>{file.path}</Text>
      {notesAt(anchorAt())}
      {commentBoxAt(anchorAt())}
      {hunks === undefined ? (
        <Text dimColor>Loading…</Text>
      ) : hunks.length === 0 ? (
        <Text dimColor>{file.isBinary ? 'Binary file' : 'No textual changes'}</Text>
      ) : (
        hunks.map((hunk, index) => (
          <Box key={`hunk:${index}:${hunk.header}`} flexDirection="column">
            <Code source={clampHunk(hunk).text} format="diff" path={file.path} />
            {notesAt(anchorAt(hunk.header))}
            {commentBoxAt(anchorAt(hunk.header))}
          </Box>
        ))
      )}
    </Box>
  )
}

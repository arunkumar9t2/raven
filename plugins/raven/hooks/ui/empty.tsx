/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { UiKit } from '../core/view'

/** Nerd Font icons the empty states use. */
export const EMPTY_ICONS = {
  doc: '\u{f0219}', // nf-md-file_document
  tasks: '\u{f0ae}', // nf-fa-tasks
  changes: '\u{f02a2}', // nf-md-git
  repo: '\u{f071}', // nf-fa-warning
} as const

/**
 * An empty pane's one-row state: a blank row above, then a dim Nerd Font icon and a short line,
 * indented so it reads as sitting in the pane rather than hugging its edge.
 */
export function emptyState(kit: UiKit, icon: string, text: string): RenderElement {
  const { Box, Text } = kit.ui
  return (
    <Box key="empty" flexDirection="column" paddingTop={1} paddingLeft={2}>
      <Text dimColor wrap="truncate-end">
        {`${icon}  ${text}`}
      </Text>
    </Box>
  )
}

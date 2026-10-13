/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit, UiKit } from '../core/view'

/**
 * Paints `color` behind a whole pane so its body matches the terminal rather than the engine's
 * own pane grey. An empty colour is the default and returns the drawing untouched.
 */
export function paneFill(
  kit: UiKit & Pick<Kit, 'rows'>,
  color: string,
  drawn: RenderElement,
): RenderElement {
  if (color === '' || kit.rows < 1) return drawn
  const { Box } = kit.ui
  return (
    <Box flexDirection="column" backgroundColor={color} minHeight={kit.rows}>
      {drawn}
    </Box>
  )
}

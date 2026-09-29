/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../core/view'

export type SelectButtonsProps = {
  /** The row's own key, and the prefix for each option's button key. */
  key: string
  options: readonly { value: string; label?: string }[]
  value: string
  onSelect: (value: string) => void
}

/** A `Select`'s options as a row of plain buttons, for a surface with no `Select`; the current
 *  value's button is not dimmed. */
export function selectButtons(kit: Kit, props: SelectButtonsProps): RenderElement {
  const { Box, Button } = kit.ui
  return (
    <Box key={props.key} flexDirection="row" gap={1}>
      {props.options.map(option => (
        <Button
          key={`${props.key}:${option.value}`}
          plain
          dimColor={option.value !== props.value}
          label={option.label}
          onPress={() => props.onSelect(option.value)}
        />
      ))}
    </Box>
  )
}

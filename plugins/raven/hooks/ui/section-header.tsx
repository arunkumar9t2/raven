/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Kit } from '../core/view'
import { badge } from './badge'
import { dot } from './dot'

export type SectionHeaderProps = {
  /** A leading category dot, in this colour; omitted when the section carries no category. */
  dot?: string
  title: string
  /** The title's (and `count`'s) colour. */
  color: string
  count?: number
  /**
   * Right-aligned metadata — `source HEAD`, a ref, a scope — dim when a plain string; an
   * element (a chip row, a source picker) draws bare, never wrapped in `Text`.
   */
  right?: RenderElement | string
}

/** A coloured title, an optional count, dim right-aligned metadata — one row, nowrap. */
export function sectionHeader(kit: Kit, props: SectionHeaderProps): RenderElement {
  const { Box, Text } = kit.ui
  const { dot: dotColor, title, color, count, right } = props

  return (
    <Box
      flexDirection="row"
      justifyContent="space-between"
      gap={1}
      overflow="hidden"
      flexWrap="nowrap"
    >
      <Text wrap="truncate-end">
        {dotColor !== undefined ? <Text>{dot(kit, dotColor)} </Text> : ''}
        <Text color={color} bold>
          {title}
        </Text>
        {count !== undefined ? <Text> {badge(kit, count, color)}</Text> : ''}
      </Text>
      {right === undefined || right === '' ? (
        ''
      ) : typeof right === 'string' ? (
        <Text dimColor>{right}</Text>
      ) : (
        <Box flexShrink={1} overflow="hidden">
          {right}
        </Box>
      )}
    </Box>
  )
}

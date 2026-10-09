/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../core/colors'
import type { UiKit } from '../core/view'
import { RULE_START } from './chrome'

/** More `─` than any pane is wide: a fill clips to the room its flex box is given. */
const FILL = '─'.repeat(400)

/** `glyph` once per row, one under another. */
export const stackOf = (glyph: string, rows: number): string =>
  Array.from({ length: Math.max(1, rows) }, () => glyph).join('\n')

/**
 * A run of `─` that takes whatever room its siblings leave. It wraps inside a one-row box that
 * clips the overflow, rather than truncating: `truncate-end` would end the line with a `…`.
 */
export function fill(kit: UiKit, color: string): RenderElement {
  const { Box, Text } = kit.ui
  return (
    <Box width={0} height={1} flexGrow={1} flexShrink={1} overflow="hidden">
      <Text color={color} wrap="wrap">
        {FILL}
      </Text>
    </Box>
  )
}

/**
 * A card's closing row: `╰` in `color`, the fill, and `end` (`╯` for a boxed card, none for an
 * open one); the one close every card draws.
 */
export function closeRow(kit: UiKit, color: string, end?: string): RenderElement {
  const { Box, Text } = kit.ui
  return (
    <Box flexDirection="row" overflow="hidden" flexWrap="nowrap">
      <Text color={color}>╰</Text>
      {fill(kit, color)}
      {end ? <Text color={color}>{end}</Text> : null}
    </Box>
  )
}

export type RuleRowProps = {
  /** The border colour: `start`, the fill and `end`. */
  color: string
  /** The opening glyphs, space included: `╭─ ` or `├─ `. */
  start: string
  /** The title, clipped before anything else gives. */
  left: RenderElement
  /** Pills drawn after the fill, e.g. a card's `✕`; the border closes right after them. */
  right?: RenderElement
  /** The closing glyphs after the pills (or after the fill): `─╮`, `╮`, or none. */
  end?: string
}

/**
 * One border row: `╭─ title ───────── pills ─╮`. The fill takes the free width, so the pills sit
 * at the right edge and the corner (if any) closes it.
 */
export function ruleRow(kit: UiKit, props: RuleRowProps): RenderElement {
  const { Box, Text } = kit.ui
  const { color } = props
  return (
    <Box flexDirection="row" overflow="hidden" flexWrap="nowrap">
      <Text color={color}>{props.start}</Text>
      <Box flexShrink={1} overflow="hidden">
        {props.left}
      </Box>
      <Text> </Text>
      {fill(kit, color)}
      {props.right ? <Text> </Text> : null}
      {props.right ?? null}
      {props.end ? <Text color={color}>{props.end}</Text> : null}
    </Box>
  )
}

export type BoxedCardProps = {
  color: string
  /** The title on the top border, after `╭─ `. */
  title: RenderElement
  /** Pills embedded in the top border, before `─╮`. */
  right?: RenderElement
  /** Interior rows: the side borders span exactly this many. */
  rows: number
  /** The interior, `rows` tall and `columns - 4` wide. */
  children: RenderElement | RenderElement[]
}

/**
 * The person's own words in a box: `╭─ title ──── pills ─╮`, `│ interior │` rows, `╰──────╯`, the
 * border in `color` and the interior on the user-message tint. Rows are `rows + 2`; the width is
 * whatever the parent gives (a text wrapped to `width - BOXED_CELLS` fits exactly).
 */
export function boxedCard(kit: UiKit, props: BoxedCardProps): RenderElement {
  const { Box, Text } = kit.ui
  const { color, rows } = props
  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {ruleRow(kit, {
        color,
        start: RULE_START.open,
        left: props.title,
        right: props.right,
        end: props.right ? '─╮' : '╮',
      })}
      <Box
        flexDirection="row"
        height={rows}
        overflow="hidden"
        flexWrap="nowrap"
        backgroundColor={COLORS.userMessage}
      >
        <Text color={color}>{stackOf('│ ', rows)}</Text>
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {props.children}
        </Box>
        <Text color={color}>{stackOf(' │', rows)}</Text>
      </Box>
      {closeRow(kit, color, '╯')}
    </Box>
  )
}

/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS } from '../core/colors'
import type { UiKit } from '../core/view'
import { openEndOf, openStartOf } from './chrome'
import { type Frame, NOTE_BAR, ROUNDED_FRAME, type Style } from './style'

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
 * A card's closing row: `start` (default `╰`) in `color`, the fill, and `end` (`╯` for a boxed
 * card, none for an open one); the one close every card draws.
 */
export function closeRow(kit: UiKit, color: string, end?: string, start = '╰'): RenderElement {
  const { Box, Text } = kit.ui
  return (
    <Box flexDirection="row" overflow="hidden" flexWrap="nowrap">
      <Text color={color}>{start}</Text>
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
  /** The border glyphs; the compose box passes `style.compose`. Rounded when omitted. */
  frame?: Frame
}

/**
 * The person's own words in a closed frame (`frame`, rounded by default): `╭─ title ──── pills ─╮`,
 * `│ interior │` rows, `╰──────╯`, the border in `color` and the interior on the user-message
 * tint. Rows are `rows + 2`; the width is whatever the parent gives (a text wrapped to
 * `width - BOXED_CELLS` fits exactly).
 */
export function boxedCard(kit: UiKit, props: BoxedCardProps): RenderElement {
  const { Box, Text } = kit.ui
  const { color, rows } = props
  const frame = props.frame ?? ROUNDED_FRAME
  return (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {ruleRow(kit, {
        color,
        start: openStartOf(frame),
        left: props.title,
        right: props.right,
        end: openEndOf(frame, props.right !== undefined),
      })}
      <Box
        flexDirection="row"
        height={rows}
        overflow="hidden"
        flexWrap="nowrap"
        backgroundColor={COLORS.userMessage}
      >
        <Text color={color}>{stackOf(`${frame.v} `, rows)}</Text>
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {props.children}
        </Box>
        <Text color={color}>{stackOf(` ${frame.v}`, rows)}</Text>
      </Box>
      {closeRow(kit, color, frame.br, frame.bl)}
    </Box>
  )
}

/** The rows a card's title takes: its own, plus the dim rule row `none` draws under it. */
export const titleRowsOf = (style: Style): number => (style.titleRule ? 2 : 1)

export type CardTitleProps = {
  /** The group's colour: the frame's border (frame styles) or the rule (`none`). */
  color: string
  /** The title, clipped before the chips give. */
  title: RenderElement
  /** Chips drawn inline, two columns after the title (never at the pane's edge). */
  chips?: RenderElement
}

/**
 * A group's title. `bar`: the title with its chips two columns after it, no rule. `none`: the same
 * row plus a dim `─` rule row under it. `sharp` / `rounded`: the frame's top border, `┌─ title
 * chips ────────┐`, the fill taking the free width.
 */
export function cardTitle(kit: UiKit, style: Style, props: CardTitleProps): RenderElement {
  const { Box } = kit.ui
  const line = (
    <Box flexDirection="row" gap={2} overflow="hidden" flexWrap="nowrap">
      <Box flexShrink={1} overflow="hidden">
        {props.title}
      </Box>
      {props.chips ? <Box flexShrink={0}>{props.chips}</Box> : null}
    </Box>
  )
  if (style.frame) {
    return ruleRow(kit, {
      color: props.color,
      start: openStartOf(style.frame),
      left: line,
      end: style.frame.tr,
    })
  }
  if (!style.titleRule) return line
  return (
    <Box flexDirection="column">
      {line}
      <Box flexDirection="row" overflow="hidden" flexWrap="nowrap">
        {fill(kit, COLORS.subtle)}
      </Box>
    </Box>
  )
}

export type GroupProps = {
  /** The rail / frame colour: the group's status colour, or the accent for the file being edited. */
  color: string
  /** The exact height of `children`: the rails are stacked glyphs this many rows tall. */
  rows: number
  /** A colour turns the last row's left cell into `◆ `: the line a note hangs under. No rail, no mark. */
  mark?: string
  children: RenderElement | RenderElement[]
}

/**
 * A group's body rows behind the style's mark: `▌ ` per row in `bar`, nothing in `none`, `│ ` and
 * ` │` either side in `sharp` / `rounded` (close it with `frameBottom`).
 */
export function groupRows(kit: UiKit, style: Style, props: GroupProps): RenderElement {
  const { Box, Text } = kit.ui
  const { color, rows, mark } = props
  const left = style.frame ? `${style.frame.v} ` : style.group ? `${style.group} ` : null
  const content = (
    <Box flexDirection="column" flexGrow={1} overflow="hidden">
      {props.children}
    </Box>
  )
  if (left === null) return content
  return (
    <Box flexDirection="row" height={rows} overflow="hidden" flexWrap="nowrap">
      {mark === undefined ? (
        <Text color={color}>{stackOf(left, rows)}</Text>
      ) : (
        <Text color={color}>
          {`${left}\n`.repeat(Math.max(0, rows - 1))}
          <Text color={mark}>◆ </Text>
        </Text>
      )}
      {content}
      {style.frame ? <Text color={color}>{stackOf(` ${style.frame.v}`, rows)}</Text> : null}
    </Box>
  )
}

/** A frame style's closing row (`└────┘` / `╰────╯`); null for `bar` and `none` (no frame). */
export function frameBottom(kit: UiKit, style: Style, color: string): RenderElement | null {
  if (!style.frame) return null
  return closeRow(kit, color, style.frame.br, style.frame.bl)
}

export type NoteCardProps = {
  /** The note's state colour (`NOTE_STATE_COLORS`): the bar only; the text keeps its own. */
  color: string
  /** The exact height of `children`. */
  rows: number
  children: RenderElement | RenderElement[]
}

/**
 * The person's note on the diff or a doc: a `┃ ` bar in the state colour on the subtle
 * user-message fill (the person's message to Claude), no frame, in every style. Width cost:
 * `NOTE_CELLS`.
 */
export function noteCard(kit: UiKit, props: NoteCardProps): RenderElement {
  const { Box, Text } = kit.ui
  const { color, rows } = props
  return (
    <Box
      flexDirection="row"
      height={rows}
      overflow="hidden"
      flexWrap="nowrap"
      backgroundColor={COLORS.userMessage}
    >
      <Text color={color}>{stackOf(`${NOTE_BAR} `, rows)}</Text>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {props.children}
      </Box>
    </Box>
  )
}

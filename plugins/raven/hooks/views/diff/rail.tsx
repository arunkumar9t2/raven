/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { UiKit } from '../../core/view'
import { groupRows, stackOf } from '../../ui/card'
import type { Style } from '../../ui/style'

export type RailedProps = {
  /** The rail / frame colour: the file's status colour, or the accent while Claude edits it. */
  color: string
  /** The exact height of `children`. */
  rows: number
  /** A colour turns the last row's rail cell into `◆ `: the line a note hangs under. */
  mark?: string
  children: RenderElement | RenderElement[]
}

/**
 * A card's body rows behind the style's mark (`groupRows`), with the one addition a diff needs: a
 * `mark` colour draws the last row's cell as `◆ `. Under `none` there is no rail to mark, so the
 * note's own card just follows the line.
 */
export function railedRows(kit: UiKit, style: Style, props: RailedProps): RenderElement {
  const { Box, Text } = kit.ui
  const { color, rows, mark } = props
  const left = style.frame ? style.frame.v : style.group
  if (mark === undefined || left === null) {
    return groupRows(kit, style, { color, rows, children: props.children })
  }
  const above = `${left} \n`.repeat(Math.max(0, rows - 1))
  return (
    <Box flexDirection="row" height={rows} overflow="hidden" flexWrap="nowrap">
      <Text color={color}>
        {above}
        <Text color={mark}>◆ </Text>
      </Text>
      <Box flexDirection="column" flexGrow={1} overflow="hidden">
        {props.children}
      </Box>
      {style.frame ? <Text color={color}>{stackOf(` ${style.frame.v}`, rows)}</Text> : null}
    </Box>
  )
}

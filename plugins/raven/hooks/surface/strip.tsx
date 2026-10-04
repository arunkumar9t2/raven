/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { ClientModule } from 'claude-code'

// A Client surface module: self-contained (it cannot import plugin code; type-only imports are
// erased), no `@jsx` pragma (the engine prepends it), no timers. Draws rows of coloured segments,
// each one line tall; a segment with an `id` is a pill that lights under the pointer and posts
// `{ press: id }` on a left click, a row with an `id` the same for the whole row.

export type Seg = {
  t: string
  c?: string
  bg?: string
  b?: boolean
  dim?: boolean
  i?: boolean
  /** Makes the segment a pill: hover-lit and pressable. */
  id?: string
  hoverBg?: string
  hoverC?: string
}
export type StripRow = { id?: string; left: Seg[]; right?: Seg[] }
export type StripProps = {
  rows: StripRow[]
  activeId?: string
  rowHoverBg?: string
  activeBg?: string
}
type Local = { row: number; pill: string }

const IDLE: Local = { row: -1, pill: '' }

/** Display width of one code point: 0 combining/zero-width, 2 wide (CJK, emoji), else 1. */
function pointWidth(cp: number): number {
  if (
    (cp >= 0x300 && cp <= 0x36f) ||
    (cp >= 0x200b && cp <= 0x200f) ||
    (cp >= 0xfe00 && cp <= 0xfe0f) ||
    cp === 0x2060
  )
    return 0
  if (
    (cp >= 0x1100 && cp <= 0x115f) ||
    (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x231a && cp <= 0x231b) ||
    cp === 0x2705 ||
    cp === 0x2728 ||
    cp === 0x274c ||
    (cp >= 0x1f300 && cp <= 0x1faff) ||
    (cp >= 0x20000 && cp <= 0x3fffd)
  )
    return 2
  return 1
}

/** Cells `text` takes. */
export function cellsOf(text: string): number {
  let width = 0
  for (const char of text) width += pointWidth(char.codePointAt(0) ?? 0)
  return width
}

/**
 * The id of the pill under column `x` of `row` in a region `columns` wide, or '' for none. Left
 * segments run from column 0; right segments end at the region's right edge (the left side clips
 * first when both do not fit).
 */
export function pillAt(row: StripRow, x: number, columns: number): string {
  let at = 0
  for (const seg of row.left) {
    const w = cellsOf(seg.t)
    if (seg.id && x >= at && x < at + w) return seg.id
    at += w
  }
  const right = row.right ?? []
  const total = right.reduce((sum, seg) => sum + cellsOf(seg.t), 0)
  at = Math.max(0, columns - total)
  for (const seg of right) {
    const w = cellsOf(seg.t)
    if (seg.id && x >= at && x < at + w) return seg.id
    at += w
  }
  return ''
}

const Strip: ClientModule<StripProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  const hover = surface.state ?? IDLE
  const set = (next: Local) => {
    const cur = surface.state ?? IDLE
    if (cur.row !== next.row || cur.pill !== next.pill) surface.setState(next)
  }

  surface.onPointer(e => {
    if (e.type === 'leave' || e.y < 0 || e.y >= props.rows.length) {
      set(IDLE)
      return
    }
    const row = props.rows[e.y]
    if (!row) return
    const pill = pillAt(row, e.x, surface.columns)
    if (e.type === 'down' && (e.button ?? 'left') === 'left') {
      if (pill) surface.post({ press: pill })
      else if (row.id) surface.post({ press: row.id })
      return
    }
    set({ row: e.y, pill })
  })

  const draw = (seg: Seg, rowIndex: number, k: string) => {
    const lit = Boolean(seg.id) && hover.row === rowIndex && hover.pill === seg.id
    return (
      <Text
        key={k}
        color={lit ? (seg.hoverC ?? seg.c) : seg.c}
        backgroundColor={lit ? (seg.hoverBg ?? seg.bg) : seg.bg}
        bold={seg.b}
        dimColor={seg.dim}
        italic={seg.i}
      >
        {seg.t}
      </Text>
    )
  }

  return (
    <Box flexDirection="column">
      {props.rows.map((r, i) => (
        <Box
          key={r.id ? `row:${r.id}` : `row-${i}`}
          flexDirection="row"
          height={1}
          overflow="hidden"
          backgroundColor={
            r.id && r.id === props.activeId
              ? props.activeBg
              : r.id && i === hover.row
                ? props.rowHoverBg
                : undefined
          }
        >
          <Box flexShrink={1} overflow="hidden">
            {r.left.filter(s => s.t !== '').map((s, j) => draw(s, i, `l${j}`))}
          </Box>
          <Box flexGrow={1} />
          {(r.right ?? []).filter(s => s.t !== '').map((s, j) => draw(s, i, `r${j}`))}
        </Box>
      ))}
    </Box>
  )
}

export default Strip

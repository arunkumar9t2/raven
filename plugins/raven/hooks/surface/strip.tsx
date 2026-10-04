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
  /** The one segment of a row that shrinks (and truncates) when the region is too narrow: a path or a title. */
  shrink?: boolean
  /** Makes the segment a pill: hover-lit, focusable and pressable. */
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
/**
 * `row`/`pill` are the hovered row's and pill's ids ('' for none; kept by id so a scroll or new
 * props never leaves the highlight on another row); `focus` is the id a click gave the keyboard
 * to ('' before any click), moved by the arrow keys.
 */
type Local = { row: string; pill: string; focus: string }

const IDLE: Local = { row: '', pill: '', focus: '' }

/** Display width of one code point: 0 for combining/zero-width, 2 for wide (CJK, emoji), else 1. */
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
    (cp >= 0x23e9 && cp <= 0x23ec) ||
    cp === 0x23f0 ||
    cp === 0x23f3 ||
    (cp >= 0x25fd && cp <= 0x25fe) ||
    (cp >= 0x2614 && cp <= 0x2615) ||
    (cp >= 0x2648 && cp <= 0x2653) ||
    cp === 0x267f ||
    cp === 0x2693 ||
    cp === 0x26a1 ||
    (cp >= 0x26aa && cp <= 0x26ab) ||
    (cp >= 0x26bd && cp <= 0x26be) ||
    (cp >= 0x26c4 && cp <= 0x26c5) ||
    cp === 0x26ce ||
    cp === 0x26d4 ||
    cp === 0x26ea ||
    (cp >= 0x26f2 && cp <= 0x26f3) ||
    cp === 0x26f5 ||
    cp === 0x26fa ||
    cp === 0x26fd ||
    cp === 0x2705 ||
    (cp >= 0x270a && cp <= 0x270b) ||
    cp === 0x2728 ||
    cp === 0x274c ||
    cp === 0x274e ||
    (cp >= 0x2753 && cp <= 0x2755) ||
    cp === 0x2757 ||
    (cp >= 0x2795 && cp <= 0x2797) ||
    cp === 0x27b0 ||
    cp === 0x27bf ||
    (cp >= 0x2b1b && cp <= 0x2b1c) ||
    cp === 0x2b50 ||
    cp === 0x2b55 ||
    cp === 0x1f004 ||
    cp === 0x1f0cf ||
    cp === 0x1f18e ||
    (cp >= 0x1f191 && cp <= 0x1f19a) ||
    (cp >= 0x1f200 && cp <= 0x1f2ff) ||
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

/** Every focusable id of a row, left to right (pills, else the row's own id). */
export function targetsOf(row: StripRow): string[] {
  const ids = [...row.left, ...(row.right ?? [])].flatMap(seg => (seg.id ? [seg.id] : []))
  const unique = [...new Set(ids)]
  return unique.length > 0 ? unique : row.id ? [row.id] : []
}

/**
 * Where a key takes the focus from `from`: ←/→ along the row's targets, ↑/↓ to the nearest row
 * with targets (the same column, clamped). Returns the new id, or `from` when it cannot move.
 */
export function focusAfter(rows: readonly StripRow[], from: string, key: string): string {
  const at = rows.findIndex(r => targetsOf(r).includes(from))
  if (at < 0) return from
  const targets = targetsOf(rows[at] as StripRow)
  const column = targets.indexOf(from)
  if (key === 'left' || key === 'right') {
    return targets[column + (key === 'left' ? -1 : 1)] ?? from
  }
  if (key !== 'up' && key !== 'down') return from
  const step = key === 'up' ? -1 : 1
  for (let i = at + step; i >= 0 && i < rows.length; i += step) {
    const there = targetsOf(rows[i] as StripRow)
    if (there.length > 0) return there[Math.min(column, there.length - 1)] as string
  }
  return from
}

const Strip: ClientModule<StripProps, Local> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? IDLE
  const set = (patch: Partial<Local>) => {
    const cur = surface.state ?? IDLE
    const next = { ...cur, ...patch }
    if (next.row !== cur.row || next.pill !== cur.pill || next.focus !== cur.focus) {
      surface.setState(next)
    }
  }

  surface.onPointer(e => {
    if (e.type === 'leave' || e.y < 0 || e.y >= props.rows.length) {
      set({ row: '', pill: '' })
      return
    }
    const row = props.rows[e.y]
    if (!row) return
    const pill = pillAt(row, e.x, surface.columns)
    if (e.type === 'down' && (e.button ?? 'left') === 'left') {
      const id = pill || row.id || ''
      if (id) {
        set({ focus: id })
        surface.post({ press: id })
      }
      return
    }
    set({ row: row.id ?? '', pill })
  })

  // Keys arrive only after a click has given the strip the focus: arrows move the ring, Enter and
  // space press what it is on.
  surface.onKey(e => {
    const focus = (surface.state ?? IDLE).focus
    if (focus === '') return
    if (e.key === 'return' || e.key === ' ') {
      surface.post({ press: focus })
      return
    }
    set({ focus: focusAfter(props.rows, focus, e.key) })
  })

  const draw = (seg: Seg, k: string) => {
    const lit = Boolean(seg.id) && state.pill === seg.id
    const isFocused = Boolean(seg.id) && state.focus === seg.id
    const text = (
      <Text
        key={k}
        color={lit ? (seg.hoverC ?? seg.c) : seg.c}
        backgroundColor={lit ? (seg.hoverBg ?? seg.bg) : seg.bg}
        bold={seg.b}
        dimColor={seg.dim}
        italic={seg.i}
        inverse={isFocused ? true : undefined}
        wrap={seg.shrink ? 'truncate-end' : undefined}
      >
        {seg.t}
      </Text>
    )
    // Only the one `shrink` segment gives way; icons, marks and counts keep their cells.
    return seg.shrink ? (
      <Box key={k} flexShrink={1} overflow="hidden">
        {text}
      </Box>
    ) : (
      <Box key={k} flexShrink={0}>
        {text}
      </Box>
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
              : r.id && r.id === state.row
                ? props.rowHoverBg
                : undefined
          }
        >
          <Box flexShrink={1} overflow="hidden">
            {r.left.filter(s => s.t !== '').map((s, j) => draw(s, `l${j}`))}
          </Box>
          <Box flexGrow={1} />
          {(r.right ?? []).filter(s => s.t !== '').map((s, j) => draw(s, `r${j}`))}
        </Box>
      ))}
    </Box>
  )
}

export default Strip

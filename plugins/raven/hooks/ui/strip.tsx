/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { PILL_COLORS, type PillKind } from '../core/colors'
import type { Kit } from '../core/view'
import type { Seg, StripRow } from '../surface/strip'
import { type Chip, chipText } from './chips'
import { widthOf } from './wrap'

export type { PillKind, Seg, StripRow }

/** A segment with the handler its pill runs; the handler stays here, only the `Seg` crosses to the surface. */
export type KitSeg = Seg & { onPress?: () => void }
/** A strip row whose pill segments carry their handlers; `onPress` is the row's own. */
export type KitRow = {
  id?: string
  /** The fallback's row `Box` key; `row:<id>` when omitted (the Client addresses a row by `id`). */
  key?: string
  left: KitSeg[]
  right?: KitSeg[]
  onPress?: () => void
}

/** `pill`'s text: the label padded by one cell each side, so the background reads as a pill. */
const padded = (icon: string, label: string): string =>
  ` ${[icon, label].filter(Boolean).join(' ')} `

/**
 * One pill: ` icon label ` on its kind's background (`PILL_COLORS`), hover-lit by the surface;
 * `id` is what a press posts and `strip` registers `onPress` under.
 */
export function pill(
  id: string,
  icon: string,
  label: string,
  kind: PillKind,
  onPress: () => void,
): KitSeg {
  const colors = PILL_COLORS[kind]
  return {
    t: padded(icon, label),
    c: colors.c,
    bg: colors.bg,
    id,
    hoverBg: colors.hoverBg,
    hoverC: colors.hoverC,
    onPress,
  }
}

/** `n` blank cells between segments. */
export const gap = (n = 1): KitSeg => ({ t: ' '.repeat(n) })

export type StripOpts = {
  /** The `Client`'s key: unique in the drawing; what `ui.message` reports as `e.element`. */
  key: string
  activeId?: string
  rowHoverBg?: string
  activeBg?: string
  /**
   * How the Client takes width: `true` (default) claims the free width of a flex row, `'stretch'`
   * leaves it to a column parent's stretch (a list), `false` sizes to the pills (a pill row).
   */
  grow?: boolean | 'stretch'
}

/**
 * Rows of coloured segments, each one line. On a surface with `canClient` one `Client` draws them
 * (`surface/strip.tsx`: hover per row and pill, left click posts `{ press: id }`); elsewhere a
 * bracket-free fallback draws the same text with each pill as a `plain` `Button` keyed by its id.
 * Either way every pill's handler is registered with the kit, so the one press path runs it.
 */
export function strip(kit: Kit, rows: readonly KitRow[], opts: StripOpts): RenderElement {
  for (const r of rows) {
    if (r.id && r.onPress) kit.press(r.id, r.onPress)
    for (const seg of [...r.left, ...(r.right ?? [])]) {
      if (seg.id && seg.onPress) kit.press(seg.id, seg.onPress)
    }
  }
  const { Box, Text, Client } = kit.ui
  if (kit.capabilities.canClient) {
    const data: StripRow[] = rows.map(r => ({
      ...(r.id ? { id: r.id } : {}),
      left: plainOf(r.left),
      ...(r.right ? { right: plainOf(r.right) } : {}),
    }))
    return (
      <Client
        key={opts.key}
        module="../surface/strip.tsx"
        flexGrow={opts.grow === false || opts.grow === 'stretch' ? undefined : 1}
        width={opts.grow === false ? widestOf(rows) : undefined}
        height={rows.length}
        props={{
          rows: data,
          ...(opts.activeId ? { activeId: opts.activeId } : {}),
          ...(opts.rowHoverBg ? { rowHoverBg: opts.rowHoverBg } : {}),
          ...(opts.activeBg ? { activeBg: opts.activeBg } : {}),
        }}
      />
    )
  }
  const draw = (seg: KitSeg, k: string) =>
    seg.id ? (
      buttonOf(kit, { key: seg.id, text: seg.t, onPress: seg.onPress ?? (() => {}) })
    ) : (
      <Text key={k} color={seg.c} bold={seg.b} dimColor={seg.dim} italic={seg.i}>
        {seg.t}
      </Text>
    )
  return (
    <Box key={opts.key} flexDirection="column">
      {rows.map((r, i) => (
        <Box
          key={r.key ?? (r.id ? `row:${r.id}` : `${opts.key}:${i}`)}
          flexDirection="row"
          gap={1}
          overflow="hidden"
          flexWrap="nowrap"
        >
          <Box flexShrink={1} overflow="hidden">
            {r.left.map((s, j) => draw(s, `l${j}`))}
          </Box>
          <Box flexGrow={1} />
          {(r.right ?? []).map((s, j) => draw(s, `r${j}`))}
        </Box>
      ))}
    </Box>
  )
}

/**
 * The plain `Button` every fallback draws — a pill, a list row's path, a chip carrying an engine
 * `action`. `text` is the label verbatim, so one padding convention holds: a pill's text is already
 * padded by `pill` (`chipText` plus a cell each side), anything else draws as given.
 */
function buttonOf(
  kit: Kit,
  props: { key: string; text: string; onPress: () => void; dim?: boolean; action?: string },
): RenderElement {
  const { Button } = kit.ui
  return (
    <Button
      key={props.key}
      plain
      dimColor={props.dim}
      action={props.action}
      label={props.text}
      onPress={props.onPress}
    />
  )
}

/** The style a segment's neighbours must share for the two to draw as one. */
const sameStyle = (a: Seg, b: Seg): boolean =>
  a.c === b.c && a.bg === b.bg && a.b === b.b && a.dim === b.dim && a.i === b.i

/**
 * What crosses to the surface: plain data, no handler, no undefined fields, and adjacent segments
 * of one style (and neither a pill nor the shrinking one) merged into one — the same cells with
 * fewer nodes.
 */
function plainOf(segs: readonly KitSeg[]): Seg[] {
  const out: Seg[] = []
  for (const { onPress: _onPress, ...seg } of segs) {
    const clean = { t: seg.t } as Seg
    for (const field of [
      'c',
      'bg',
      'b',
      'dim',
      'i',
      'shrink',
      'id',
      'hoverBg',
      'hoverC',
    ] as const) {
      if (seg[field] !== undefined) Object.assign(clean, { [field]: seg[field] })
    }
    const prev = out[out.length - 1]
    if (prev && !prev.id && !clean.id && !prev.shrink && !clean.shrink && sameStyle(prev, clean)) {
      prev.t += clean.t
    } else {
      out.push(clean)
    }
  }
  return out
}

/**
 * A row of chips as pills, one left-to-right strip sized to its pills (so it sits wherever its
 * parent puts it: in a row's right slot, beside a label). `mode` is one for the row or one per chip
 * (`chipsLayout`). A chip carrying an engine `action` draws as a `plain` Button first — a Client
 * cannot bind a chord — sized like a pill so `chipsLayout`'s widths hold. `key` names the row; the
 * strip's Client is `${key}:pills`.
 */
export function pillRow(
  kit: Kit,
  chips: readonly Chip[],
  mode: 'words' | 'icons' | readonly ('words' | 'icons')[],
  key: string,
): RenderElement {
  const { Box } = kit.ui
  const modeOf = (index: number): 'words' | 'icons' =>
    typeof mode === 'string' ? mode : (mode[index] ?? 'icons')
  const drawn = chips.map((chip, index) => ({ chip, text: chipText(chip, modeOf(index)) }))
  const buttons = drawn.filter(({ chip }) => chip.action !== undefined)
  const segs = drawn
    .filter(({ chip }) => chip.action === undefined)
    .flatMap(({ chip, text }, i) => {
      const seg = pill(chip.key, '', text, chip.kind ?? 'normal', chip.onPress)
      return i === 0 ? [seg] : [gap(), seg]
    })
  const pills = strip(kit, [{ left: segs }], { key: `${key}:pills`, grow: false })
  if (buttons.length === 0) return pills
  return (
    <Box key={key} flexDirection="row" gap={1} overflow="hidden" flexWrap="nowrap">
      {buttons.map(({ chip, text }) =>
        buttonOf(kit, {
          key: chip.key,
          text: ` ${text} `,
          onPress: chip.onPress,
          dim: true,
          action: chip.action,
        }),
      )}
      {segs.length > 0 ? pills : null}
    </Box>
  )
}

/** The cells the widest row's segments take: a pill row's explicit region width (an unsized `Client` collapses in a flex row). */
function widestOf(rows: readonly KitRow[]): number {
  return Math.max(
    0,
    ...rows.map(r => [...r.left, ...(r.right ?? [])].reduce((sum, seg) => sum + widthOf(seg.t), 0)),
  )
}

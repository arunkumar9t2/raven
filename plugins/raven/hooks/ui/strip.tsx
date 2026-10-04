/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { PILL_COLORS, type PillKind } from '../core/colors'
import type { Kit } from '../core/view'
import type { Seg, StripRow } from '../surface/strip'

export type { PillKind, Seg, StripRow }

/** A segment with the handler its pill runs; the handler stays here, only the `Seg` crosses to the surface. */
export type KitSeg = Seg & { onPress?: () => void }
/** A strip row whose pill segments carry their handlers; `onPress` is the row's own. */
export type KitRow = { id?: string; left: KitSeg[]; right?: KitSeg[]; onPress?: () => void }

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

export type StripOpts = {
  /** The `Client`'s key: unique in the drawing; what `ui.message` reports as `e.element`. */
  key: string
  activeId?: string
  rowHoverBg?: string
  activeBg?: string
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
  const { Box, Text, Button, Client } = kit.ui
  if (kit.capabilities.canClient) {
    const data: StripRow[] = rows.map(r => ({
      ...(r.id ? { id: r.id } : {}),
      left: r.left.map(plainOf),
      ...(r.right ? { right: r.right.map(plainOf) } : {}),
    }))
    return (
      <Client
        key={opts.key}
        module="../surface/strip.tsx"
        flexGrow={1}
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
      <Button key={seg.id} plain label={seg.t.trim()} onPress={seg.onPress ?? (() => {})} />
    ) : (
      <Text key={k} color={seg.c} bold={seg.b} dimColor={seg.dim} italic={seg.i}>
        {seg.t}
      </Text>
    )
  return (
    <Box key={opts.key} flexDirection="column">
      {rows.map((r, i) => (
        <Box
          key={r.id ?? `${opts.key}:${i}`}
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

/** Drops the handler: what crosses to the surface is plain data. */
function plainOf({ onPress: _onPress, ...seg }: KitSeg): Seg {
  return Object.fromEntries(Object.entries(seg).filter(([, v]) => v !== undefined)) as Seg
}

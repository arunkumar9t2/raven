import { describe, expect, test } from 'bun:test'
import type { Kit } from '../../hooks/core/view'
import { row } from '../../hooks/ui/row'

/**
 * `row()`'s render functions compile to bare `h(...)` calls (the mod sandbox's classic JSX
 * runtime, see `types/claude-code.d.ts`); outside that sandbox nothing supplies `h`, so this spec
 * supplies a minimal one itself — a plain-data tree a test can walk — rather than run it through
 * the mod-kit sandbox (see `diff-view-reveal.spec.ts` for the same pattern).
 */
type Node = { type: unknown; props: Record<string, unknown> }

function h(tag: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Node {
  return { type: tag, props: { ...(props ?? {}), children } }
}

function Fragment(props: Record<string, unknown>): Node {
  return { type: 'Fragment', props }
}

;(globalThis as Record<string, unknown>).h = h
;(globalThis as Record<string, unknown>).Fragment = Fragment

const Box = () => null
const Text = () => null

const KIT = {
  ui: { Box, Text },
  columns: 40,
  rows: 10,
  capabilities: { canType: true, canPick: true, canShowImage: true },
} as unknown as Kit

describe('row', () => {
  test('its own Box grows to fill a row-direction parent, so space-between has free width to spend', () => {
    const tree = row(KIT, { left: 'src/api.ts', right: '+3 −3' }) as unknown as Node
    expect(tree.props.flexGrow).toBe(1)
    expect(tree.props.justifyContent).toBe('space-between')
  })
})

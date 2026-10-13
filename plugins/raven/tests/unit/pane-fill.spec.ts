import { describe, expect, test } from 'bun:test'
import type { RenderElement } from 'claude-code'
import type { Kit } from '../../hooks/core/view'
import { paneFill } from '../../hooks/ui/pane-fill'

type Node = { type: unknown; props: Record<string, unknown> }

function h(tag: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Node {
  return { type: tag, props: { ...(props ?? {}), children } }
}
;(globalThis as Record<string, unknown>).h = h
;(globalThis as Record<string, unknown>).Fragment = 'Fragment'

const kit = { ui: { Box: 'Box', Text: 'Text' }, rows: 30 } as unknown as Parameters<
  typeof paneFill
>[0] &
  Pick<Kit, 'rows'>
const drawn = { type: 'Text', props: { children: ['body'] } } as unknown as RenderElement

describe('paneFill', () => {
  test('an empty colour returns the drawing unchanged', () => {
    expect(paneFill(kit, '', drawn)).toBe(drawn)
  })

  test('a colour wraps the drawing in a full-height Box with that background', () => {
    const wrapped = paneFill(kit, '#101315', drawn) as unknown as Node
    expect(wrapped.type).toBe('Box')
    expect(wrapped.props.backgroundColor).toBe('#101315')
    expect(wrapped.props.height).toBe(30)
    expect(wrapped.props.flexDirection).toBe('column')
    expect(wrapped.props.children).toEqual([drawn])
  })
})

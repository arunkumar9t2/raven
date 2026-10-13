import { describe, expect, test } from 'bun:test'
import type { RenderElement } from 'claude-code'
import type { UiKit } from '../../hooks/core/view'
import {
  boxedCard,
  cardTitle,
  closeRow,
  frameBottom,
  groupRows,
  noteCard,
  stackOf,
  titleRowsOf,
} from '../../hooks/ui/card'
import { iconText, NOTE_GLYPH } from '../../hooks/ui/icon-text'
import { ROUNDED_FRAME, SHARP_FRAME, styleOf } from '../../hooks/ui/style'

type Node = { type: unknown; props: Record<string, unknown> }

function h(tag: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Node {
  return { type: tag, props: { ...(props ?? {}), children } }
}
function Fragment(props: Record<string, unknown>): Node {
  return { type: 'Fragment', props }
}
;(globalThis as Record<string, unknown>).h = h
;(globalThis as Record<string, unknown>).Fragment = Fragment

const kit = { ui: { Box: 'Box', Text: 'Text' } } as unknown as UiKit

function flatten(children: unknown): unknown[] {
  if (children == null || children === false) return []
  if (Array.isArray(children)) return children.flatMap(flatten)
  return [children]
}
function findAll(node: unknown, predicate: (n: Node) => boolean, out: Node[] = []): Node[] {
  for (const n of flatten(node)) {
    const current = n as Node
    if (current === null || typeof current !== 'object') continue
    if (predicate(current)) out.push(current)
    findAll(current.props?.children, predicate, out)
  }
  return out
}
function textUnder(node: unknown): string {
  return flatten(node)
    .map(n =>
      typeof n === 'string' || typeof n === 'number'
        ? String(n)
        : textUnder((n as Node).props?.children),
    )
    .join('')
}
/** Every Text's own string, in tree order. */
const textsOf = (node: unknown): string[] =>
  findAll(node, n => n.type === 'Text').map(n => textUnder(n.props.children))
const el = (text: string): RenderElement => h('Text', null, text) as unknown as RenderElement
const body = el('body')

describe('titleRowsOf', () => {
  test('only none draws a rule row under the title', () => {
    expect(titleRowsOf(styleOf('bar'))).toBe(1)
    expect(titleRowsOf(styleOf('none'))).toBe(2)
    expect(titleRowsOf(styleOf('sharp'))).toBe(1)
    expect(titleRowsOf(styleOf('rounded'))).toBe(1)
  })
})

describe('groupRows', () => {
  test('bar draws one ▌ per body row in the colour', () => {
    const out = groupRows(kit, styleOf('bar'), { color: 'warning', rows: 3, children: body })
    const rail = findAll(out, n => n.type === 'Text' && n.props.color === 'warning')
    expect(rail.map(n => textUnder(n.props.children))).toEqual(['▌ \n▌ \n▌ '])
    expect(textsOf(out)).toContain('body')
  })

  test('none draws the children and nothing else', () => {
    const out = groupRows(kit, styleOf('none'), { color: 'warning', rows: 3, children: body })
    expect(textsOf(out)).toEqual(['body'])
  })

  test('sharp and rounded close both sides with │', () => {
    for (const name of ['sharp', 'rounded'] as const) {
      const out = groupRows(kit, styleOf(name), { color: 'warning', rows: 2, children: body })
      expect(textsOf(out)).toEqual(['│ \n│ ', 'body', ' │\n │'])
    }
  })
})

describe('frameBottom', () => {
  test('a frame style closes with its corners, bar and none do not', () => {
    expect(frameBottom(kit, styleOf('bar'), 'x')).toBeNull()
    expect(frameBottom(kit, styleOf('none'), 'x')).toBeNull()
    expect(textsOf(frameBottom(kit, styleOf('sharp'), 'x'))[0]).toBe('└')
    expect(textsOf(frameBottom(kit, styleOf('sharp'), 'x')).at(-1)).toBe('┘')
    expect(textsOf(frameBottom(kit, styleOf('rounded'), 'x'))[0]).toBe('╰')
    expect(textsOf(frameBottom(kit, styleOf('rounded'), 'x')).at(-1)).toBe('╯')
  })
})

describe('cardTitle', () => {
  const props = {
    color: 'warning',
    title: el('a.ts'),
    chips: el(iconText(NOTE_GLYPH, 'note')),
  }

  test('bar: title then chips, no border glyph', () => {
    const texts = textsOf(cardTitle(kit, styleOf('bar'), props))
    expect(texts).toEqual(['a.ts', iconText(NOTE_GLYPH, 'note')])
  })

  test('none: the same row plus a fill rule row', () => {
    const out = cardTitle(kit, styleOf('none'), props)
    expect(textsOf(out)).toEqual(['a.ts', iconText(NOTE_GLYPH, 'note'), '─'.repeat(400)])
  })

  test('sharp and rounded: the corner, a space-padded title, chips, fill, closing corner', () => {
    const sharp = textsOf(cardTitle(kit, styleOf('sharp'), props))
    expect(sharp[0]).toBe('┌─ ')
    expect(sharp.at(-1)).toBe('┐')
    const rounded = textsOf(cardTitle(kit, styleOf('rounded'), props))
    expect(rounded[0]).toBe('╭─ ')
    expect(rounded.at(-1)).toBe('╮')
    expect(sharp).toContain(iconText(NOTE_GLYPH, 'note'))
  })

  test('chips are optional', () => {
    const texts = textsOf(cardTitle(kit, styleOf('bar'), { color: 'x', title: props.title }))
    expect(texts).toEqual(['a.ts'])
  })
})

describe('noteCard', () => {
  test('a ┃ bar in the state colour on the user-message fill, no frame', () => {
    const out = noteCard(kit, { color: 'suggestion', rows: 2, children: body }) as Node
    expect(out.props.backgroundColor).toBe('userMessageBackground')
    expect(textsOf(out)).toEqual(['┃ \n┃ ', 'body'])
    expect(findAll(out, n => n.props.color === 'suggestion')).toHaveLength(1)
  })
})

describe('boxedCard frame', () => {
  const props = { color: 'claude', title: el('comment'), rows: 1, children: body }

  test('defaults to the rounded frame, as before', () => {
    const texts = textsOf(boxedCard(kit, props))
    expect(texts[0]).toBe('╭─ ')
    expect(texts).toContain('╯')
    expect(texts).toContain('╰')
  })

  test('takes the sharp frame the compose box uses', () => {
    const texts = textsOf(boxedCard(kit, { ...props, frame: SHARP_FRAME }))
    expect(texts[0]).toBe('┌─ ')
    expect(texts).toContain('┐')
    expect(texts).toContain('└')
    expect(texts).toContain('┘')
    expect(texts).toContain('│ ')
  })

  test('the rounded frame is the default frame', () => {
    expect(textsOf(boxedCard(kit, { ...props, frame: ROUNDED_FRAME }))).toEqual(
      textsOf(boxedCard(kit, props)),
    )
  })
})

describe('closeRow start glyph', () => {
  test('defaults to ╰ and takes another start', () => {
    expect(textsOf(closeRow(kit, 'x', '╯'))[0]).toBe('╰')
    expect(textsOf(closeRow(kit, 'x', '┘', '└'))[0]).toBe('└')
  })
})

describe('stackOf', () => {
  test('is unchanged: one glyph per row', () => {
    expect(stackOf('│', 3)).toBe('│\n│\n│')
    expect(stackOf('│', 0)).toBe('│')
  })
})

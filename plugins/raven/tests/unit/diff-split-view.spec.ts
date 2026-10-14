import { describe, expect, test } from 'bun:test'
import type { Kit } from '../../hooks/core/view'
import { hunkFrom } from '../../hooks/git/hunks'
import { splitHunkOf } from '../../hooks/views/diff/split'
import { type SplitHunkProps, splitHunk } from '../../hooks/views/diff/split-view'

/** Same plain-data `h` as diff-view-reveal.spec.ts: the sandbox's classic JSX runtime is global. */
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
const KIT = { ui: { Box, Text }, columns: 120, rows: 40 } as unknown as Kit

function flatten(children: unknown): unknown[] {
  if (children == null || children === false) return []
  if (Array.isArray(children)) return children.flatMap(flatten)
  return [children]
}
function findAll(node: unknown, predicate: (n: Node) => boolean, out: Node[] = []): Node[] {
  for (const n of flatten(node)) {
    const current = n as Node
    if (typeof n === 'object' && n !== null) {
      if (predicate(current)) out.push(current)
      findAll(current.props?.children, predicate, out)
    }
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

// 5 rows: ctx0 | (old1,new1) (old2,new2) (-,new3) | ctx6. Old lines 1..4, new lines 1..5.
const SPLIT = splitHunkOf(
  hunkFrom('@@ -1,4 +1,5 @@', [' ctx0', '-old1', '-old2', '+new1', '+new2', '+new3', ' ctx6']),
)
const propsOf = (patch: Partial<SplitHunkProps> = {}): SplitHunkProps => ({
  key: 'k',
  split: SPLIT,
  from: 0,
  to: SPLIT.rows.length,
  width: 101,
  ...patch,
})

describe('a Text per row on the diff fills', () => {
  const rowsOfTree = (tree: unknown) =>
    findAll(tree, n => typeof n.props.key === 'string' && String(n.props.key).startsWith('row:'))

  test('one row per split row, removed left and added right', () => {
    const tree = splitHunk(KIT, propsOf())
    const rows = rowsOfTree(tree)
    expect(rows.length).toBe(5)
    expect(textUnder(rows[1])).toContain('-2 old1')
    expect(textUnder(rows[1])).toContain('+2 new1')
    expect(textUnder(rows[3])).toContain('+4 new3')
    expect(textUnder(rows[3])).not.toContain('-')
  })

  test('a window draws only its rows, keyed by their absolute index', () => {
    const rows = rowsOfTree(splitHunk(KIT, propsOf({ from: 2, to: 4 })))
    expect(rows.map(row => row.props.key)).toEqual(['row:2', 'row:3'])
  })

  test('fills use the theme add and remove keys, one per changed side', () => {
    const tree = splitHunk(KIT, propsOf())
    const fills = (key: string) =>
      findAll(tree, n => n.props.backgroundColor === key && n.props.wrap === 'truncate-end').length
    expect(fills('diffRemoved')).toBe(2)
    expect(fills('diffAdded')).toBe(3)
  })

  test('the side box carries the fill too, so a cut wide character leaves no bare cell', () => {
    const tree = splitHunk(KIT, propsOf())
    const boxes = findAll(tree, n => n.type === Box && n.props.backgroundColor !== undefined)
    expect(boxes.length).toBe(5)
  })
})

describe('changed words', () => {
  const pair = splitHunkOf(hunkFrom('@@ -1,1 +1,1 @@', ['-let x = 1', '+let x = 2']))

  test('the changed word of a paired row sits on the word fill', () => {
    const tree = splitHunk(KIT, propsOf({ split: pair, from: 0, to: 1 }))
    const added = findAll(tree, n => n.props.backgroundColor === 'diffAddedWord')
    const removed = findAll(tree, n => n.props.backgroundColor === 'diffRemovedWord')
    expect(added.map(textUnder)).toEqual(['2'])
    expect(removed.map(textUnder)).toEqual(['1'])
  })

  test('an unpaired row has no word fill', () => {
    const tree = splitHunk(KIT, propsOf({ from: 3, to: 4 }))
    expect(findAll(tree, n => n.props.backgroundColor === 'diffAddedWord').length).toBe(0)
    expect(findAll(tree, n => n.props.backgroundColor === 'diffAdded').length).toBeGreaterThan(0)
  })
})

describe('a truncation marker row', () => {
  const clamped = splitHunkOf(
    hunkFrom('@@ -1,5 +1,5 @@', [' a', '-b', '+c', ' … (577 more lines)']),
  )

  test('draws once, dim, across the whole body, with no line number', () => {
    const tree = splitHunk(
      KIT,
      propsOf({ split: clamped, from: 0, to: clamped.rows.length, width: 100 }),
    )
    const drawn = textUnder(tree)
    expect(drawn.split('… (577 more lines)').length - 1).toBe(1)
    const marker = findAll(tree, n => n.type === Text && textUnder(n) === '… (577 more lines)')
    expect(marker).toHaveLength(1)
    expect(marker[0]?.props.dimColor).toBe(true)
  })
})

import { describe, expect, test } from 'bun:test'
import { changedDirsOf, pathsOf, rowsOf, treeOf } from '../../hooks/views/tree/tree'

describe('treeOf', () => {
  test('nests dirs before files, sorted by name, propagating changed counts to ancestors', () => {
    const paths = ['src/b.ts', 'src/a.ts', 'src/nested/c.ts', 'README.md', 'src.txt']
    const changed = new Map([
      ['src/a.ts', 'modified' as const],
      ['src/nested/c.ts', 'added' as const],
    ])
    const root = treeOf(paths, changed)

    expect(root.kind).toBe('dir')
    expect(root.children.map(n => n.name)).toEqual(['src', 'README.md', 'src.txt'])

    const src = root.children[0]
    if (src?.kind !== 'dir') throw new Error('expected dir')
    expect(src.children.map(n => n.name)).toEqual(['nested', 'a.ts', 'b.ts'])
    expect(src.changed).toBe(2)

    const nested = src.children[0]
    if (nested?.kind !== 'dir') throw new Error('expected dir')
    expect(nested.changed).toBe(1)

    const a = src.children[1]
    expect(a).toEqual({ kind: 'file', path: 'src/a.ts', name: 'a.ts', status: 'modified' })
    const b = src.children[2]
    expect(b).toEqual({ kind: 'file', path: 'src/b.ts', name: 'b.ts', status: undefined })
  })

  test('adds a deleted changed path absent from paths', () => {
    const root = treeOf(['src/keep.ts'], new Map([['src/gone.ts', 'deleted']]))
    const src = root.children[0]
    if (src?.kind !== 'dir') throw new Error('expected dir')
    expect(src.children.map(n => n.name)).toEqual(['gone.ts', 'keep.ts'])
    expect(src.changed).toBe(1)
  })

  test('root itself carries the total changed count', () => {
    const root = treeOf(['a.ts', 'b.ts'], new Map([['a.ts', 'modified']]))
    expect(root.changed).toBe(1)
  })
})

describe('rowsOf', () => {
  test('respects the expanded set, skipping unexpanded children, at correct depth', () => {
    const root = treeOf(['src/a.ts', 'src/nested/c.ts', 'top.ts'], new Map())

    const collapsed = rowsOf(root, new Set())
    expect(collapsed.map(r => r.node.name)).toEqual(['src', 'top.ts'])
    expect(collapsed.every(r => r.depth === 0)).toBe(true)
    expect(collapsed[0]?.isExpanded).toBe(false)

    const expanded = rowsOf(root, new Set(['src']))
    expect(expanded.map(r => [r.node.name, r.depth])).toEqual([
      ['src', 0],
      ['nested', 1],
      ['a.ts', 1],
      ['top.ts', 0],
    ])
    expect(expanded.find(r => r.node.name === 'nested')?.isExpanded).toBe(false)

    const fullyExpanded = rowsOf(root, new Set(['src', 'src/nested']))
    expect(fullyExpanded.map(r => [r.node.name, r.depth])).toEqual([
      ['src', 0],
      ['nested', 1],
      ['c.ts', 2],
      ['a.ts', 1],
      ['top.ts', 0],
    ])
  })
})

describe('changedDirsOf', () => {
  test('collects only dirs containing a change, excluding the root', () => {
    const root = treeOf(
      ['src/a.ts', 'src/nested/c.ts', 'other/b.ts'],
      new Map([['src/nested/c.ts', 'added']]),
    )
    expect(changedDirsOf(root)).toEqual(new Set(['src', 'src/nested']))
  })

  test('empty when nothing changed', () => {
    const root = treeOf(['src/a.ts'], new Map())
    expect(changedDirsOf(root)).toEqual(new Set())
  })
})

describe('pathsOf', () => {
  test('parses NUL-separated paths', () => {
    expect(pathsOf('a.ts\0b.ts\0')).toEqual({ paths: ['a.ts', 'b.ts'], isCapped: false })
  })

  test('caps at the given limit and reports isCapped', () => {
    const z = Array.from({ length: 5 }, (_, i) => `f${i}.ts`).join('\0')
    expect(pathsOf(z, 3)).toEqual({ paths: ['f0.ts', 'f1.ts', 'f2.ts'], isCapped: true })
  })

  test('defaults to a 5000 cap', () => {
    const z = Array.from({ length: 5001 }, (_, i) => `f${i}.ts`).join('\0')
    const { paths, isCapped } = pathsOf(z)
    expect(paths).toHaveLength(5000)
    expect(isCapped).toBe(true)
  })
})

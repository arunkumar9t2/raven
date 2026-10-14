import { describe, expect, test } from 'bun:test'
import { styleOf } from '../../hooks/ui/style'
import type { DrawnLine } from '../../hooks/ui/table-layout'
import type { TableBlock } from '../../hooks/views/markdown-chunks'
import { createTableCache } from '../../hooks/views/table-cache'

const block: TableBlock = {
  kind: 'table',
  header: ['Path', 'Note'],
  align: ['left', 'right'],
  rows: [['a.ts', 'short']],
}
const textOf = (rows: DrawnLine[]) => rows.map(line => line.map(piece => piece.text).join(''))

describe('createTableCache', () => {
  test('the same block, width and look is laid out once', () => {
    const cache = createTableCache()
    const bar = styleOf('bar')
    expect(cache.rowsOf(block, 80, bar)).toBe(cache.rowsOf(block, 80, bar))
  })

  test('bar draws a header rule, sharp a grid, rounded a grid with round corners', () => {
    const cache = createTableCache()
    expect(textOf(cache.rowsOf(block, 80, styleOf('bar')))).toEqual([
      'Path   Note',
      '───────────',
      'a.ts  short',
    ])
    expect(textOf(cache.rowsOf(block, 80, styleOf('sharp')))[0]).toBe('┌──────┬───────┐')
    expect(textOf(cache.rowsOf(block, 80, styleOf('rounded')))[0]).toBe('╭──────┬───────╮')
  })

  test('changing only the style recomputes: the key carries mode and corners, not just width', () => {
    const cache = createTableCache()
    const first = cache.rowsOf(block, 80, styleOf('sharp'))
    const second = cache.rowsOf(block, 80, styleOf('rounded'))
    expect(second).not.toBe(first)
    expect(textOf(first)[0]).toBe('┌──────┬───────┐')
    expect(textOf(second)[0]).toBe('╭──────┬───────╮')
    expect(textOf(cache.rowsOf(block, 80, styleOf('none')))[1]).toMatch(/^─+$/)
  })

  test('changing only the width recomputes', () => {
    const cache = createTableCache()
    const bar = styleOf('bar')
    expect(cache.rowsOf(block, 80, bar)).not.toBe(cache.rowsOf(block, 40, bar))
  })

  test('a width under 1 is laid out at 1 rather than failing', () => {
    expect(() => createTableCache().rowsOf(block, 0, styleOf('bar'))).not.toThrow()
  })
})

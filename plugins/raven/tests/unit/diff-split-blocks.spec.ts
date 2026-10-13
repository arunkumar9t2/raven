import { describe, expect, test } from 'bun:test'
import type { ChangedFile } from '../../hooks/git/changes'
import { hunkFrom } from '../../hooks/git/hunks'
import type { Comment } from '../../hooks/review/comments'
import { blocksOf, hunkKeyOf } from '../../hooks/views/diff/blocks'
import { type Block, contentRowsOf, rowsOf, windowOf } from '../../hooks/views/diff/layout'

const FILE: ChangedFile = {
  path: 'a.ts',
  status: 'modified',
  adds: 3,
  dels: 2,
  isBinary: false,
}
const HUNK = hunkFrom('@@ -1,4 +1,5 @@', [
  ' ctx0',
  '-old1',
  '-old2',
  '+new1',
  '+new2',
  '+new3',
  ' ctx6',
])

const hunkBlocks = (blocks: readonly Block[]) => blocks.filter(block => block.kind === 'hunk')
/** The row at which the first hunk block starts. */
const hunkStartOf = (blocks: readonly Block[]) => {
  let row = 0
  for (const block of blocks) {
    if (block.kind === 'hunk') return row
    row += rowsOf(block)
  }
  return row
}

describe('a split hunk block', () => {
  test('unsplit, a hunk is its body lines and carries no split payload', () => {
    const [hunk] = hunkBlocks(blocksOf(FILE, [HUNK], [], null, { width: 100 }))
    expect(hunk && rowsOf(hunk)).toBe(7)
    expect(hunk && 'split' in hunk).toBe(false)
  })

  test('split, a hunk is its side-by-side rows: five here, not seven', () => {
    const blocks = blocksOf(FILE, [HUNK], [], null, { width: 100, split: true })
    const [hunk] = hunkBlocks(blocks)
    expect(hunk?.kind === 'hunk' && hunk.split?.rows.length).toBe(5)
    expect(hunk?.kind === 'hunk' && hunk.split?.gutter).toBe(1)
    expect(hunk && rowsOf(hunk)).toBe(5)
    const unsplit = blocksOf(FILE, [HUNK], [], null, { width: 100 })
    expect(contentRowsOf(unsplit) - contentRowsOf(blocks)).toBe(2)
  })

  test('windowOf slices a split hunk in split rows', () => {
    const blocks = blocksOf(FILE, [HUNK], [], null, { width: 100, split: true })
    const start = hunkStartOf(blocks)
    const middle = windowOf(blocks, start + 1, 2).find(placed => placed.block.kind === 'hunk')
    expect(middle && { from: middle.from, to: middle.to }).toEqual({ from: 1, to: 3 })
    const whole = windowOf(blocks, 0, 100).find(placed => placed.block.kind === 'hunk')
    expect(whole && { from: whole.from, to: whole.to }).toEqual({ from: 0, to: 5 })
  })

  test('a hunk of only "No newline" markers has no split rows', () => {
    const odd = hunkFrom('@@ -1,1 +1,1 @@', ['\\ No newline at end of file'])
    const [hunk] = hunkBlocks(blocksOf(FILE, [odd], [], null, { width: 100, split: true }))
    expect(hunk && rowsOf(hunk)).toBe(0)
  })

  test('the read-only path splits too', () => {
    const [hunk] = hunkBlocks(
      blocksOf(FILE, [HUNK], [], null, { width: 100, split: true, readOnly: true }),
    )
    expect(hunk && rowsOf(hunk)).toBe(5)
  })

  test('a hunk with an inline note keeps every segment on the whole hunk gutter', () => {
    const note: Comment = {
      id: 'n1',
      path: 'a.ts',
      hunk: HUNK.header,
      line: { side: 'old', number: 2, text: 'old1' },
      text: 'why',
      status: 'pending',
      createdAt: 0,
    }
    const blocks = blocksOf(FILE, [HUNK], [note], null, { width: 100, split: true })
    const segments = hunkBlocks(blocks)
    for (const segment of segments) expect(segment.kind === 'hunk' && segment.split?.gutter).toBe(1)
    expect(segments[0]?.kind === 'hunk' && segments[0].key).toBe(hunkKeyOf(0, HUNK))
  })

  test('a whole-file hunk never splits: no payload, rows equal its source lines', () => {
    const source = hunkFrom('@@ -0,0 +1,3 @@', ['+a', '+b', '+c'])
    const added: ChangedFile = { ...FILE, status: 'added', adds: 3, dels: 0 }
    for (const readOnly of [false, true]) {
      const blocks = blocksOf(added, [source], [], null, { width: 100, split: true, readOnly })
      const [hunk] = hunkBlocks(blocks)
      expect(hunk && 'split' in hunk).toBe(false)
      expect(hunk && rowsOf(hunk)).toBe(3)
    }
  })
})

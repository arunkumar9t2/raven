import { describe, expect, test } from 'bun:test'
import type { ChangedFile } from '../../hooks/git/changes'
import { hunkFrom } from '../../hooks/git/hunks'
import type { Comment } from '../../hooks/review/comments'
import { hunkOfChange } from '../../hooks/review/turns'
import { type BodyItem, blocksOf, hunkKeyOf, streamOf } from '../../hooks/views/diff/blocks'
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

const noteOn = (id: string, line: Comment['line']): Comment => ({
  id,
  path: FILE.path,
  hunk: HUNK.header,
  line,
  text: `note ${id}`,
  status: 'pending',
  createdAt: 0,
})

/** The block sequence as short labels: `hunk:<rows>` or the fixed item's kind. */
const shapeOf = (blocks: readonly Block[]): string[] =>
  blocks
    .map(block => (block.kind === 'hunk' ? `hunk:${rowsOf(block)}` : (block.item as BodyItem).kind))
    .filter(label => label !== 'blank' && label !== 'close')

describe('notes in a split hunk', () => {
  // new1 is the first added line: new line 2, body row 3, inside the change run that ends at row 6.
  const onNew1 = noteOn('n1', { number: 2, side: 'new', text: 'new1' })

  test('unified cuts right under the commented line', () => {
    const blocks = blocksOf(FILE, [HUNK], [onNew1], null, { width: 100 })
    expect(shapeOf(blocks)).toEqual(['title', 'hunk-header', 'hunk:4', 'note', 'hunk:3'])
  })

  test("split cuts under the end of the line's change run", () => {
    const blocks = blocksOf(FILE, [HUNK], [onNew1], null, { width: 100, split: true })
    expect(shapeOf(blocks)).toEqual(['title', 'hunk-header', 'hunk:4', 'note', 'hunk:1'])
  })

  test('a note on a removed line draws under the same run', () => {
    const onOld1 = noteOn('n2', { number: 2, side: 'old', text: 'old1' })
    const blocks = blocksOf(FILE, [HUNK], [onOld1], null, { width: 100, split: true })
    expect(shapeOf(blocks)).toEqual(['title', 'hunk-header', 'hunk:4', 'note', 'hunk:1'])
  })

  test('two notes on one run share one cut and keep their order', () => {
    const onNew3 = noteOn('n3', { number: 4, side: 'new', text: 'new3' })
    const blocks = blocksOf(FILE, [HUNK], [onNew1, onNew3], null, { width: 100, split: true })
    expect(shapeOf(blocks)).toEqual(['title', 'hunk-header', 'hunk:4', 'note', 'note', 'hunk:1'])
  })

  test('a note on a context line draws right under that row', () => {
    const onCtx = noteOn('n4', { number: 1, side: 'new', text: 'ctx0' })
    const blocks = blocksOf(FILE, [HUNK], [onCtx], null, { width: 100, split: true })
    expect(shapeOf(blocks)).toEqual(['title', 'hunk-header', 'hunk:1', 'note', 'hunk:4'])
  })

  test('the rows still total the split hunk plus the note rows, and segments keep one gutter', () => {
    const plain = blocksOf(FILE, [HUNK], [], null, { width: 100, split: true })
    const withNote = blocksOf(FILE, [HUNK], [onNew1], null, { width: 100, split: true })
    const note = withNote.find(block => block.kind === 'fixed' && block.key.startsWith('note:'))
    expect(contentRowsOf(withNote) - contentRowsOf(plain)).toBe(note ? rowsOf(note) : -1)
    const gutters = withNote.flatMap(block =>
      block.kind === 'hunk' && block.split ? [block.split.gutter] : [],
    )
    expect(new Set(gutters).size).toBe(1)
  })

  test('segments of a note anchored mid-run partition the whole hunk rows exactly', () => {
    const whole = blocksOf(FILE, [HUNK], [], null, { width: 100, split: true })
    const wholeRows = whole.flatMap(block =>
      block.kind === 'hunk' ? (block.split?.rows ?? []) : [],
    )
    // Mid-run: old2 (second removed line) and new2 (second added line).
    for (const line of [
      { number: 3, side: 'old' as const, text: 'old2' },
      { number: 3, side: 'new' as const, text: 'new2' },
    ]) {
      const cut = blocksOf(FILE, [HUNK], [noteOn('m', line)], null, { width: 100, split: true })
      const rows = cut.flatMap(block => (block.kind === 'hunk' ? (block.split?.rows ?? []) : []))
      expect(rows).toEqual(wholeRows)
    }
  })

  test('the compose box of a split hunk is told it is split', () => {
    const anchor = { path: FILE.path, hunk: HUNK.header }
    const blocks = blocksOf(FILE, [HUNK], [], anchor, { width: 100, split: true })
    const box = blocks.find(block => block.kind === 'fixed' && block.key.startsWith('comment-box'))
    expect(box).toMatchObject({ item: { kind: 'comment-box', isSplit: true } })
    const unified = blocksOf(FILE, [HUNK], [], anchor, { width: 100 })
    const plainBox = unified.find(
      block => block.kind === 'fixed' && block.key.startsWith('comment-box'),
    )
    expect(plainBox && 'isSplit' in (plainBox as { item: object }).item).toBe(false)
  })
})

describe('notes in a split hunk: more shapes', () => {
  const MULTI = hunkFrom('@@ -1,7 +1,7 @@', [' c0', '-a1', '+b1', ' c3', '-a2', '+b2', ' c6'])
  const on = (id: string, number: number, side: 'old' | 'new', text: string) =>
    noteOn(id, { number, side, text })
  const multiNote = (notes: Comment[]) =>
    shapeOf(
      blocksOf(
        FILE,
        [MULTI],
        notes.map(n => ({ ...n, hunk: MULTI.header })),
        null,
        { width: 100, split: true },
      ),
    )

  test('a context note between two runs cuts right under that context row', () => {
    expect(multiNote([on('c', 3, 'new', 'c3')])).toEqual([
      'title',
      'hunk-header',
      'hunk:3',
      'note',
      'hunk:2',
    ])
  })

  test('a context note followed by a run keeps the run whole in the next segment', () => {
    expect(multiNote([on('c', 1, 'new', 'c0')])).toEqual([
      'title',
      'hunk-header',
      'hunk:1',
      'note',
      'hunk:4',
    ])
  })

  test('notes on different runs each get their own cut', () => {
    expect(multiNote([on('x', 2, 'new', 'b1'), on('y', 4, 'new', 'b2')])).toEqual([
      'title',
      'hunk-header',
      'hunk:2',
      'note',
      'hunk:2',
      'note',
      'hunk:1',
    ])
  })

  test('a whole hunk in split keeps unified cuts and its box carries no isSplit', () => {
    const added = hunkFrom('@@ -0,0 +1,3 @@', ['+l1', '+l2', '+l3'])
    const file: ChangedFile = { path: 'n.ts', status: 'added', adds: 3, dels: 0, isBinary: false }
    const note: Comment = {
      ...noteOn('w', { number: 2, side: 'new', text: 'l2' }),
      path: 'n.ts',
      hunk: added.header,
    }
    const blocks = blocksOf(
      file,
      [added],
      [note],
      { path: 'n.ts', hunk: added.header },
      { width: 100, split: true },
    )
    expect(shapeOf(blocks)).toEqual([
      'title',
      'hunk-header',
      'hunk:2',
      'note',
      'hunk:1',
      'comment-box',
    ])
    const box = blocks.find(
      block => block.kind === 'fixed' && (block.item as BodyItem).kind === 'comment-box',
    )
    expect(box && 'isSplit' in (box as { item: object }).item).toBe(false)
  })
})

describe('a read-only turn hunk', () => {
  const edit = hunkOfChange(
    'keep\nold one\nold two\ntail',
    'keep\nnew one\nnew two\nnew three\ntail',
  )

  test('splits into paired rows like a git hunk: six body lines become five rows', () => {
    const blocks = blocksOf(FILE, [edit], [], null, { width: 100, readOnly: true, split: true })
    const [hunk] = hunkBlocks(blocks)
    // keep | (old one,new one) (old two,new two) (-,new three) | tail
    expect(hunk && rowsOf(hunk)).toBe(5)
    expect(hunk?.kind === 'hunk' && hunk.split?.rows.map(row => row.kind)).toEqual([
      'context',
      'change',
      'change',
      'change',
      'context',
    ])
  })

  test('the turn stream carries the split hunks and totals their rows', () => {
    const stream = streamOf([FILE], () => [edit], [], null, {
      width: 100,
      readOnly: true,
      split: true,
    })
    const unified = streamOf([FILE], () => [edit], [], null, { width: 100, readOnly: true })
    expect(unified.contentRows - stream.contentRows).toBe(2)
  })

  test('with split off the turn hunk is unchanged', () => {
    const [hunk] = hunkBlocks(blocksOf(FILE, [edit], [], null, { width: 100, readOnly: true }))
    expect(hunk && 'split' in hunk).toBe(false)
  })
})

describe('a hunk with one side empty', () => {
  const written = hunkOfChange('', 'one\ntwo\nthree\nfour')

  test('a turn Write (all adds) is never split: unified rows, no split payload', () => {
    const blocks = blocksOf(FILE, [written], [], null, { width: 100, readOnly: true, split: true })
    const [hunk] = hunkBlocks(blocks)
    expect(hunk && 'split' in hunk).toBe(false)
    // The phantom blank line `hunkOfChange` removes from the empty before, plus four adds.
    expect(hunk && rowsOf(hunk)).toBe(5)
  })

  test('a plain all-add hunk is never split, whatever the file status says', () => {
    const added = hunkFrom('@@ -0,0 +1,3 @@', ['+a', '+b', '+c'])
    const [hunk] = hunkBlocks(blocksOf(FILE, [added], [], null, { width: 100, split: true }))
    expect(hunk && 'split' in hunk).toBe(false)
    expect(hunk && rowsOf(hunk)).toBe(3)
  })

  test('an all-delete hunk is never split either', () => {
    const removed = hunkFrom('@@ -1,2 +0,0 @@', ['-a', '-b'])
    const [hunk] = hunkBlocks(blocksOf(FILE, [removed], [], null, { width: 100, split: true }))
    expect(hunk && 'split' in hunk).toBe(false)
  })

  test('a hunk with context beside its adds still splits', () => {
    const inserted = hunkFrom('@@ -1,2 +1,3 @@', [' a', '+b', ' c'])
    const [hunk] = hunkBlocks(blocksOf(FILE, [inserted], [], null, { width: 100, split: true }))
    expect(hunk && 'split' in hunk).toBe(true)
  })

  test('its compose box offers old-side lines because it draws unified', () => {
    const removed = hunkFrom('@@ -1,2 +0,0 @@', ['-a', '-b'])
    const anchor = { path: 'a.ts', hunk: removed.header }
    const blocks = blocksOf(FILE, [removed], [], anchor, { width: 100, split: true })
    const box = blocks.find(
      block => block.kind === 'fixed' && (block.item as BodyItem).kind === 'comment-box',
    )
    expect(box && 'isSplit' in (box as { item: object }).item).toBe(false)
  })
})

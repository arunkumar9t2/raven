import { describe, expect, test } from 'bun:test'
import type { ChangedFile } from '../../hooks/git/changes'
import { bodyLinesOf, type Hunk } from '../../hooks/git/hunks'
import type { Comment, Comments } from '../../hooks/review/comments'
import {
  addressedKeyOf,
  commentBoxKeyOf,
  hunkHeaderKeyOf,
  noteKeyOf,
} from '../../hooks/views/diff/anchor'
import {
  type BlocksOptions,
  blocksOf as blocksOfAt,
  fileAtRow,
  hunkKeyOf,
  ORPHANS_TITLE_KEY,
  OUTDATED_TITLE_KEY,
  orphanPathKeyOf,
  STATUS_KEY,
  streamOf as streamOfAt,
  TITLE_KEY,
} from '../../hooks/views/diff/blocks'
import { contentRowsOf } from '../../hooks/views/diff/layout'
import { NOTE_MAX_ROWS, noteLinesOf } from '../../hooks/views/diff/note-layout'

/** The stream's width is a required option; most specs do not care, so 100 unless they say. */
const blocksOf = (
  ...[f, h, c, composing, o]: [
    ChangedFile,
    Parameters<typeof blocksOfAt>[1],
    Comments,
    Parameters<typeof blocksOfAt>[3],
    Partial<BlocksOptions>?,
  ]
) => blocksOfAt(f, h, c, composing, { width: 100, ...o })
const streamOf = (
  files: Parameters<typeof streamOfAt>[0],
  hunksFor: Parameters<typeof streamOfAt>[1],
  c: Comments,
  composing: Parameters<typeof streamOfAt>[3],
  o: Partial<BlocksOptions> = {},
  gone?: Parameters<typeof streamOfAt>[5],
) => streamOfAt(files, hunksFor, c, composing, { width: 100, ...o }, gone)

const file: ChangedFile = {
  path: 'a.txt',
  status: 'modified',
  adds: 2,
  dels: 1,
  isBinary: false,
}

function hunkOf(header: string, lines: readonly string[]): Hunk {
  return { header, text: `${[header, ...lines].join('\n')}\n` }
}

function commentOf(patch: Partial<Comment>): Comment {
  return {
    id: 'c1',
    path: file.path,
    text: 'looks off',
    status: 'pending',
    createdAt: 0,
    ...patch,
  }
}

const hunkA = hunkOf('@@ -1,2 +1,2 @@', [' a', '-b', '+c'])
const hunkB = hunkOf('@@ -10,1 +10,1 @@', ['-x', '+y'])

describe("a note block's rows", () => {
  const long = 'word '.repeat(60).trim()
  const noteRows = (width: number, text = long) =>
    blocksOf(file, [hunkA], [commentOf({ id: 'n1', text })], null, { width }).find(
      block => block.key === noteKeyOf('n1'),
    )

  test('a short note is one row', () => {
    expect(noteRows(100, 'looks off')).toMatchObject({ rows: 1 })
  })

  test("a long note's rows are its wrapped line count at the width, and change with it", () => {
    const wide = noteRows(100)
    const narrow = noteRows(50)
    const wideLines = noteLinesOf(commentOf({ id: 'n1', text: long }), 99)
    const narrowLines = noteLinesOf(commentOf({ id: 'n1', text: long }), 49)
    expect(wide).toMatchObject({ rows: wideLines.length })
    expect(narrow).toMatchObject({ rows: narrowLines.length })
    expect(wideLines.length).toBeGreaterThan(1)
    expect(narrowLines.length).toBeGreaterThan(wideLines.length - 1)
    expect(narrowLines.length).toBeLessThanOrEqual(NOTE_MAX_ROWS)
  })

  test('a very long note stops at six rows and ends with an ellipsis', () => {
    const lines = noteLinesOf(commentOf({ id: 'n1', text: 'x'.repeat(2000) }), 60)
    expect(lines).toHaveLength(NOTE_MAX_ROWS)
    expect(lines.at(-1)?.endsWith('…')).toBe(true)
  })

  test('the stream counts the wrapped rows, so windowing stays exact', () => {
    const at = (width: number) =>
      streamOf([file], () => [hunkA], [commentOf({ id: 'n1', text: long })], null, { width })
    expect(at(40).contentRows).toBeGreaterThan(at(120).contentRows)
    expect(at(40).contentRows).toBe(contentRowsOf(at(40).blocks))
  })
})

describe('inline line threads (R39)', () => {
  // body rows: 0 ' a' (o1 n1), 1 '-b' (o2), 2 '+c' (n2), 3 ' d' (o3 n3), 4 '+e' (n4)
  const hunkL = hunkOf('@@ -1,3 +1,4 @@', [' a', '-b', '+c', ' d', '+e'])
  const onLine = (id: string, number: number, side: 'old' | 'new' = 'new', text = 'x') =>
    commentOf({ id, hunk: hunkL.header, text, line: { number, side, text: '' } })
  const segmentsOf = (comments: Comments) =>
    blocksOf(file, [hunkL], comments, null).filter(b => b.kind === 'hunk')
  const bodiesOf = (blocks: ReturnType<typeof segmentsOf>) =>
    blocks.map(b => (b.kind === 'hunk' ? [...bodyLinesOf(b.hunk)] : []))
  const keysOf = (comments: Comments) => blocksOf(file, [hunkL], comments, null).map(b => b.key)

  test('no line note leaves one whole hunk block', () => {
    const hunks = segmentsOf([commentOf({ id: 'n1', hunk: hunkL.header })])
    expect(hunks).toHaveLength(1)
    expect(hunks[0]).toMatchObject({ key: hunkKeyOf(0, hunkL) })
    expect(hunks[0]).toMatchObject({ hunk: hunkL })
  })

  test('a line note splits the hunk: lines up to it, the card, the rest', () => {
    const blocks = blocksOf(file, [hunkL], [onLine('n1', 2)], null)
    const keys = blocks.map(b => b.key)
    const note = keys.indexOf(noteKeyOf('n1'))
    const hunks = blocks.filter(b => b.kind === 'hunk')
    expect(hunks).toHaveLength(2)
    expect(bodiesOf(hunks)).toEqual([
      [' a', '-b', '+c'],
      [' d', '+e'],
    ])
    // each segment is a pre-sliced hunk whose gutter numbers stay true
    expect(hunks.map(h => (h as { hunk: Hunk }).hunk.header)).toEqual([
      '@@ -1,2 +1,2 @@',
      '@@ -3,1 +3,2 @@',
    ])
    expect(keys.indexOf(hunks[0]?.key as string)).toBe(note - 1)
    expect(keys.indexOf(hunks[1]?.key as string)).toBe(note + 1)
    expect(hunks[0]).toMatchObject({ mark: 'pending' })
  })

  test('two notes on different lines make three segments', () => {
    const hunks = segmentsOf([onLine('n1', 2), onLine('n2', 4)])
    expect(bodiesOf(hunks)).toEqual([
      [' a', '-b', '+c'],
      [' d', '+e'],
    ])
    // line 4 (new) is the last body row, so no trailing segment: two, not three
    const three = segmentsOf([onLine('n1', 1), onLine('n2', 3)])
    expect(three).toHaveLength(3)
    expect(new Set(three.map(h => h.key)).size).toBe(3)
  })

  test('an old-side line is found by counting context and removed lines', () => {
    const hunks = segmentsOf([onLine('n1', 2, 'old')])
    expect(bodiesOf(hunks)[0]).toEqual([' a', '-b'])
  })

  test('a line that cannot be found falls back to after the hunk', () => {
    const keys = keysOf([onLine('n1', 99)])
    expect(segmentsOf([onLine('n1', 99)])).toHaveLength(1)
    expect(keys.at(-1)).toBe(noteKeyOf('n1'))
  })

  test('hunk-wide notes stay after the hunk', () => {
    const keys = keysOf([commentOf({ id: 'w', hunk: hunkL.header }), onLine('n1', 2)])
    expect(keys.at(-1)).toBe(noteKeyOf('w'))
  })

  test('rows total the unsplit hunk plus the note rows', () => {
    const plain = contentRowsOf(blocksOf(file, [hunkL], [], null))
    const split = contentRowsOf(blocksOf(file, [hunkL], [onLine('n1', 2), onLine('n2', 1)], null))
    expect(split).toBe(plain + 2)
  })

  test('the compose box stays after the hunk', () => {
    const anchor = { path: file.path, hunk: hunkL.header }
    const keys = blocksOf(file, [hunkL], [onLine('n1', 2)], anchor).map(b => b.key)
    expect(keys.at(-1)).toBe(commentBoxKeyOf(anchor))
  })
})

describe('blocksOf', () => {
  test('a file with no hunks yet is title, status row; idle draws no comment box', () => {
    const blocks = blocksOf(file, undefined, [], null)
    expect(blocks.map(b => b.key)).toEqual([TITLE_KEY, STATUS_KEY])
    expect(blocks[0]).toMatchObject({ item: { kind: 'title', file, canNote: true } })
    expect(blocks.at(-1)).toMatchObject({ item: { kind: 'status', text: 'Loading…' } })
  })

  test('an idle file draws no comment-box block; the heading carries the note control', () => {
    const blocks = blocksOf(file, [hunkA], [], null)
    expect(blocks.some(block => block.key.startsWith('comment-box:'))).toBe(false)
    expect(blocks[0]).toMatchObject({ item: { kind: 'title', canNote: true } })
  })

  test('a comment box block carries its anchor while that anchor is being composed', () => {
    const anchor = { path: file.path }
    const blocks = blocksOf(file, [hunkA], [], anchor)
    const box = blocks.find(b => b.key === commentBoxKeyOf(anchor))
    expect(box).toMatchObject({ item: { kind: 'comment-box', anchor } })
  })

  test('a note block carries its comment', () => {
    const comment = commentOf({ id: 'n1' })
    const blocks = blocksOf(file, [hunkA], [comment], null)
    const noteBlock = blocks.find(b => b.key === noteKeyOf('n1'))
    expect(noteBlock).toMatchObject({ item: { kind: 'note', comment } })
  })

  test('a doc-section comment never draws in a diff file whose path it happens to share', () => {
    // The Files tree opens a markdown file in the Doc pane by its git-relative path — the same
    // string `file.path` already is — so a section comment made there can collide with this file's
    // own path exactly, with no hunk to tell them apart; only `comment.section` does.
    const sectionComment = commentOf({ id: 's1', section: 'Notes', sectionIndex: 0 })
    const blocks = blocksOf(file, [hunkA], [sectionComment], null)
    expect(blocks.find(b => b.key === noteKeyOf('s1'))).toBeUndefined()
  })

  test('order: title, then each hunk preceded by its own toolbar row, no row between two hunks', () => {
    const blocks = blocksOf(file, [hunkA, hunkB], [], null)
    expect(blocks.map(b => b.key)).toEqual([
      TITLE_KEY,
      hunkHeaderKeyOf({ path: file.path, hunk: hunkA.header }),
      'hunk:0:@@ -1,2 +1,2 @@',
      hunkHeaderKeyOf({ path: file.path, hunk: hunkB.header }),
      'hunk:1:@@ -10,1 +10,1 @@',
    ])
  })

  test('order by item kind mirrors the key order, with no block between two hunks', () => {
    const blocks = blocksOf(file, [hunkA, hunkB], [], null)
    expect(blocks.map(b => (b.kind === 'hunk' ? 'hunk' : b.item.kind))).toEqual([
      'title',
      'hunk-header',
      'hunk',
      'hunk-header',
      'hunk',
    ])
  })

  test('a note per comment adds one fixed row each, at the right anchor', () => {
    const comments: Comments = [
      commentOf({ id: 'file-note' }),
      commentOf({ id: 'hunk-note', hunk: hunkA.header }),
    ]
    const blocks = blocksOf(file, [hunkA], comments, null)
    expect(blocks.map(b => b.key)).toEqual([
      TITLE_KEY,
      noteKeyOf('file-note'),
      hunkHeaderKeyOf({ path: file.path, hunk: hunkA.header }),
      'hunk:0:@@ -1,2 +1,2 @@',
      noteKeyOf('hunk-note'),
    ])
  })

  test('composing on a hunk is 4 rows (line-picker Select + Input at most two rows + hint row); the file box stays absent', () => {
    const blocks = blocksOf(file, [hunkA], [], { path: file.path, hunk: hunkA.header })
    const fileBox = blocks.find(b => b.key === commentBoxKeyOf({ path: file.path }))
    const hunkBox = blocks.find(
      b => b.key === commentBoxKeyOf({ path: file.path, hunk: hunkA.header }),
    )
    expect(fileBox).toBeUndefined()
    expect(hunkBox).toMatchObject({ rows: 4 })
  })

  test('composing on the file (no hunk) is 3 rows (Input at most two rows + hint row): no line-picker to draw', () => {
    const blocks = blocksOf(file, [hunkA], [], { path: file.path })
    const fileBox = blocks.find(b => b.key === commentBoxKeyOf({ path: file.path }))
    expect(fileBox).toMatchObject({ rows: 3 })
  })

  test('the compose box is a constant: the Input draws at most two rows, plus the hint row', () => {
    const rowsOf = (composing: { path: string; hunk?: string }, hunks = [hunkA]) =>
      blocksOf(file, hunks, [], composing).find(b => b.key.startsWith('comment-box:'))
    expect(rowsOf({ path: file.path })).toMatchObject({ rows: 3 })
    expect(rowsOf({ path: file.path, hunk: hunkA.header })).toMatchObject({ rows: 4 })
  })

  test('row total matches title + notes + toolbar + hunk lines', () => {
    const comments: Comments = [commentOf({ id: 'n1' })]
    const blocks = blocksOf(file, [hunkA, hunkB], comments, null)
    // title(1) + note(1) + hunkAheader(1) + hunkA(3 lines) + hunkBheader(1) + hunkB(2 lines)
    expect(contentRowsOf(blocks)).toBe(1 + 1 + 1 + 3 + 1 + 2)
  })

  test('row total with a note and an active compose box together', () => {
    const comments: Comments = [commentOf({ id: 'n1', hunk: hunkA.header })]
    const blocks = blocksOf(file, [hunkA], comments, { path: file.path, hunk: hunkA.header })
    // title(1) + hunkAheader(1) + hunkA(3 lines) + note(1) + composebox(4, with the line picker)
    expect(contentRowsOf(blocks)).toBe(1 + 1 + 3 + 1 + 4)
  })

  test('an empty, non-binary file with no textual changes gets a status row, no gap or hunk blocks', () => {
    const blocks = blocksOf(file, [], [], null)
    expect(blocks.map(b => b.key)).toEqual([TITLE_KEY, STATUS_KEY])
    expect(blocks.at(-1)).toMatchObject({ item: { kind: 'status', text: 'No textual changes' } })
  })

  test('a binary file with no hunks gets a "Binary file" status row', () => {
    const blocks = blocksOf({ ...file, isBinary: true }, [], [], null)
    expect(blocks.at(-1)).toMatchObject({ item: { kind: 'status', text: 'Binary file' } })
  })

  test('a comment anchored to a hunk no longer present renders in an outdated group after the hunks', () => {
    const stale = commentOf({ id: 'stale', hunk: hunkB.header, text: 'still relevant' })
    const blocks = blocksOf(file, [hunkA], [stale], null)
    const titleIndex = blocks.findIndex(b => b.key === OUTDATED_TITLE_KEY)
    const noteIndex = blocks.findIndex(b => b.key === noteKeyOf('stale'))
    expect(titleIndex).toBeGreaterThan(-1)
    expect(noteIndex).toBeGreaterThan(titleIndex)
    expect(blocks.find(b => b.key === noteKeyOf('stale'))).toMatchObject({
      item: { kind: 'note', comment: stale },
    })
    // Not rendered under hunkA's own (unrelated) anchor.
    expect(
      blocks.findIndex(b => b.key === hunkHeaderKeyOf({ path: file.path, hunk: hunkA.header })),
    ).toBeLessThan(titleIndex)
  })

  test('an outdated comment stays out of the group once its hunk reappears', () => {
    const live = commentOf({ id: 'live', hunk: hunkA.header })
    const blocks = blocksOf(file, [hunkA], [live], null)
    expect(blocks.some(b => b.key === OUTDATED_TITLE_KEY)).toBe(false)
    expect(blocks.find(b => b.key === noteKeyOf('live'))).toBeDefined()
  })

  test('addressed comments at an anchor collapse into one "N addressed" row, others still show', () => {
    const addressed = commentOf({ id: 'a1', hunk: hunkA.header, status: 'addressed' })
    const other = commentOf({ id: 'a2', hunk: hunkA.header, status: 'addressed' })
    const pending = commentOf({ id: 'p1', hunk: hunkA.header, status: 'pending' })
    const blocks = blocksOf(file, [hunkA], [addressed, other, pending], null)
    const anchor = { path: file.path, hunk: hunkA.header }

    expect(blocks.some(b => b.key === noteKeyOf('a1'))).toBe(false)
    expect(blocks.some(b => b.key === noteKeyOf('a2'))).toBe(false)
    expect(blocks.find(b => b.key === addressedKeyOf(anchor))).toMatchObject({
      item: { kind: 'addressed', count: 2 },
    })
    expect(blocks.find(b => b.key === noteKeyOf('p1'))).toMatchObject({
      item: { kind: 'note', comment: pending },
    })
  })

  test('an outdated anchor with only addressed comments also collapses', () => {
    const addressed = commentOf({ id: 'a1', hunk: hunkB.header, status: 'addressed' })
    const blocks = blocksOf(file, [hunkA], [addressed], null)
    expect(
      blocks.find(b => b.key === addressedKeyOf({ path: file.path, hunk: hunkB.header })),
    ).toMatchObject({
      item: { kind: 'addressed', count: 1 },
    })
  })

  test("another file's comments never draw under this file", () => {
    const elsewhere = {
      id: 'x1',
      path: 'other.ts',
      text: 'not yours',
      status: 'pending' as const,
      createdAt: 0,
    }
    const blocks = blocksOf(file, [hunkA], [elsewhere], null)
    expect(blocks.some(block => block.kind === 'fixed' && block.item.kind === 'note')).toBe(false)
  })

  test('a renamed file keeps a comment made under its old path', () => {
    const renamed = { ...file, path: 'new.ts', oldPath: 'old.ts', status: 'renamed' as const }
    const underOldPath = commentOf({ id: 'o1', path: 'old.ts' })
    const blocks = blocksOf(renamed, [hunkA], [underOldPath], null)
    expect(blocks.find(b => b.key === noteKeyOf('o1'))).toMatchObject({
      item: { kind: 'note', comment: underOldPath },
    })
  })

  test('a hunk-header row precedes every hunk, carrying its anchor, hunk and canNote', () => {
    const blocks = blocksOf(file, [hunkA, hunkB], [], null)
    const anchorA = { path: file.path, hunk: hunkA.header }
    const anchorB = { path: file.path, hunk: hunkB.header }
    expect(blocks.find(b => b.key === hunkHeaderKeyOf(anchorA))).toMatchObject({
      item: { kind: 'hunk-header', anchor: anchorA, hunk: hunkA, canNote: true, isReadOnly: false },
    })
    expect(blocks.find(b => b.key === hunkHeaderKeyOf(anchorB))).toMatchObject({
      item: { kind: 'hunk-header', anchor: anchorB, hunk: hunkB, canNote: true, isReadOnly: false },
    })
  })
})

describe('blocksOf with degraded capabilities', () => {
  test('no Input drops every comment-box block, file and hunk alike, but keeps notes', () => {
    const comment = commentOf({ id: 'n1', hunk: hunkA.header })
    const blocks = blocksOf(file, [hunkA], [comment], null, {
      capabilities: { canType: false, canPick: true, canShowImage: false },
    })

    expect(blocks.some(b => b.kind === 'fixed' && b.item.kind === 'comment-box')).toBe(false)
    expect(blocks.find(b => b.key === noteKeyOf('n1'))).toMatchObject({
      item: { kind: 'note', comment },
    })
  })

  test('no Input leaves composing with no compose box, even while an anchor is "composing"', () => {
    const blocks = blocksOf(
      file,
      [hunkA],
      [],
      { path: file.path, hunk: hunkA.header },
      {
        capabilities: { canType: false, canPick: true, canShowImage: false },
      },
    )
    expect(
      blocks.some(b => b.key === commentBoxKeyOf({ path: file.path, hunk: hunkA.header })),
    ).toBe(false)
  })

  test('no Select composing on a hunk is 2 rows: the picker row is dropped', () => {
    const blocks = blocksOf(
      file,
      [hunkA],
      [],
      { path: file.path, hunk: hunkA.header },
      {
        capabilities: { canType: true, canPick: false, canShowImage: false },
      },
    )
    const hunkBox = blocks.find(
      b => b.key === commentBoxKeyOf({ path: file.path, hunk: hunkA.header }),
    )
    expect(hunkBox).toMatchObject({ rows: 3 })
  })
})

describe('blocksOf for a turn source', () => {
  test('titles the file with its own path (the header names the turn), drops comment/stage/revert rows, but keeps a header-only toolbar per hunk', () => {
    const blocks = blocksOf(file, [hunkA, hunkB], [], null, { readOnly: true })

    expect(blocks[0]).toMatchObject({ item: { kind: 'title', file } })
    expect(blocks.some(b => b.key === commentBoxKeyOf({ path: file.path }))).toBe(false)
    const headerA = blocks.find(
      b => b.key === hunkHeaderKeyOf({ path: file.path, hunk: hunkA.header }),
    )
    expect(headerA).toMatchObject({
      item: { kind: 'hunk-header', canNote: false, isReadOnly: true },
    })
    expect(blocks.map(b => b.kind)).toEqual(['fixed', 'fixed', 'hunk', 'fixed', 'hunk'])
  })

  test('drops outdated comments too, since a turn has none of its own', () => {
    const stale = commentOf({ hunk: '@@ -99,1 +99,1 @@' })
    const blocks = blocksOf(file, [hunkA], [stale], null, { readOnly: true })

    expect(blocks.some(b => b.key === OUTDATED_TITLE_KEY)).toBe(false)
  })
})

describe('streamOf', () => {
  const b = { ...file, path: 'b.ts' }

  test('lays the files out one after another with path-prefixed keys', () => {
    const stream = streamOf([file, b], () => [hunkA], [], null)
    const keys = stream.blocks.map(block => block.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys[0]).toBe(`${file.path}#${TITLE_KEY}`)
    expect(keys).toContain(`b.ts#sep`)
    expect(keys).toContain(`b.ts#${TITLE_KEY}`)
  })

  test('contentRows is the files’ own rows plus 1 per separator', () => {
    const stream = streamOf([file, b], () => [hunkA], [], null)
    const ownRows =
      contentRowsOf(blocksOf(file, [hunkA], [], null)) +
      contentRowsOf(blocksOf(b, [hunkA], [], null))
    expect(stream.contentRows).toBe(ownRows + 1)
  })

  test('records each file title row and the total', () => {
    const stream = streamOf([file, b], () => [hunkA], [], null)
    expect(stream.titleRows.get(file.path)).toBe(0)
    const bRow = stream.titleRows.get('b.ts') ?? -1
    expect(bRow).toBeGreaterThan(0)
    expect(stream.contentRows).toBeGreaterThan(bRow)
  })

  test('fileAtRow names the file whose section holds the row', () => {
    const stream = streamOf([file, b], () => [hunkA], [], null)
    const bRow = stream.titleRows.get('b.ts') ?? 0
    expect(fileAtRow(stream.titleRows, 0)).toBe(file.path)
    expect(fileAtRow(stream.titleRows, bRow - 1)).toBe(file.path)
    expect(fileAtRow(stream.titleRows, bRow)).toBe('b.ts')
    expect(fileAtRow(new Map(), 0)).toBeNull()
  })

  test('an unread file says why instead of Loading…', () => {
    const stream = streamOf([file], () => undefined, [], null, {
      unreadText: 'Not read: too many new files',
    })
    expect(stream.blocks.at(-1)).toMatchObject({
      item: { kind: 'status', text: 'Not read: too many new files' },
    })
  })

  test('a turn source (read-only) still titles each file with its own path, not a shared "Turn N"', () => {
    const stream = streamOf([file, b], () => [hunkA], [], null, { readOnly: true })
    const titleOf = (path: string) =>
      stream.blocks.find(block => block.key === `${path}#${TITLE_KEY}`)
    expect(titleOf(file.path)).toMatchObject({ item: { kind: 'title', file } })
    expect(titleOf('b.ts')).toMatchObject({ item: { kind: 'title', file: b } })
  })
})

describe('streamOf orphan group', () => {
  test('a comment on a path matching no stream file draws under a trailing "Not in this diff" group', () => {
    const orphan = commentOf({ id: 'o1', path: 'gone.ts' })
    const stream = streamOf([file], () => [hunkA], [orphan], null)
    const keys = stream.blocks.map(block => block.key)
    expect(keys).toContain(`orphans#${ORPHANS_TITLE_KEY}`)
    expect(keys).toContain(`orphans#${orphanPathKeyOf('gone.ts')}`)
    expect(keys).toContain(`orphans#${noteKeyOf('o1')}`)
  })

  test('no orphan group when every comment matches a stream file', () => {
    const stream = streamOf([file], () => [hunkA], [commentOf({})], null)
    expect(stream.blocks.some(block => block.key.startsWith('orphans#'))).toBe(false)
  })

  test('a comment on a renamed file’s old path is not orphaned when the new file carries that oldPath', () => {
    const renamed: ChangedFile = { ...file, path: 'new.ts', oldPath: 'old.ts', status: 'renamed' }
    const comment = commentOf({ path: 'old.ts' })
    const stream = streamOf([renamed], () => [hunkA], [comment], null)
    expect(stream.blocks.some(block => block.key.startsWith('orphans#'))).toBe(false)
  })

  test('a doc comment (carries a section) never joins the orphans group', () => {
    const doc = commentOf({ path: '/work/README.md', section: '(top)' })
    const stream = streamOf([file], () => [hunkA], [doc], null)
    expect(stream.blocks.some(block => block.key.startsWith('orphans#'))).toBe(false)
  })

  test('gonePaths marks an orphan path gone when named, not when absent from it', () => {
    const gone = commentOf({ id: 'o1', path: 'gone.ts' })
    const here = commentOf({ id: 'o2', path: 'here.ts' })
    const stream = streamOf([file], () => [hunkA], [gone, here], null, {}, new Set(['gone.ts']))
    const goneRow = stream.blocks.find(
      block => block.key === `orphans#${orphanPathKeyOf('gone.ts')}`,
    )
    const hereRow = stream.blocks.find(
      block => block.key === `orphans#${orphanPathKeyOf('here.ts')}`,
    )
    expect(goneRow).toMatchObject({ item: { kind: 'orphan-path', isGone: true } })
    expect(hereRow).toMatchObject({ item: { kind: 'orphan-path', isGone: false } })
  })

  test('a path never checked (omitted gonePaths) never marks a path gone — fail open', () => {
    const comment = commentOf({ path: 'gone.ts' })
    const stream = streamOf([file], () => [hunkA], [comment], null)
    const row = stream.blocks.find(block => block.key === `orphans#${orphanPathKeyOf('gone.ts')}`)
    expect(row).toMatchObject({ item: { kind: 'orphan-path', isGone: false } })
  })

  test('contentRows accounts for the orphan group’s own rows', () => {
    const comment = commentOf({ path: 'gone.ts' })
    const withOrphan = streamOf([file], () => [hunkA], [comment], null)
    const without = streamOf([file], () => [hunkA], [], null)
    // heading row + path row + 1 note row = 3 extra rows.
    expect(withOrphan.contentRows).toBe(without.contentRows + 3)
  })
})

import { describe, expect, test } from 'bun:test'
import type { ChangedFile } from '../../hooks/git/changes'
import type { Hunk } from '../../hooks/git/hunks'
import type { Comment, Comments } from '../../hooks/review/comments'
import {
  addressedKeyOf,
  blocksOf,
  commentBoxKeyOf,
  hunkActionsKeyOf,
  noteKeyOf,
  OUTDATED_TITLE_KEY,
  STATUS_KEY,
  TITLE_KEY,
} from '../../hooks/views/diff/blocks'
import { contentRowsOf } from '../../hooks/views/diff/layout'

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

describe('blocksOf', () => {
  test('a file with no hunks yet is title, comment box, status row', () => {
    const blocks = blocksOf(file, undefined, [], null)
    expect(blocks.map(b => b.key)).toEqual([
      TITLE_KEY,
      commentBoxKeyOf({ path: file.path }),
      STATUS_KEY,
    ])
    expect(blocks[0]).toMatchObject({ item: { kind: 'title', file } })
    expect(blocks.at(-1)).toMatchObject({ item: { kind: 'status', text: 'Loading…' } })
  })

  test('a comment box block carries its anchor', () => {
    const blocks = blocksOf(file, [hunkA], [], null)
    const box = blocks.find(b => b.key === commentBoxKeyOf({ path: file.path }))
    expect(box).toMatchObject({ item: { kind: 'comment-box', anchor: { path: file.path } } })
  })

  test('a note block carries its comment', () => {
    const comment = commentOf({ id: 'n1' })
    const blocks = blocksOf(file, [hunkA], [comment], null)
    const noteBlock = blocks.find(b => b.key === noteKeyOf('n1'))
    expect(noteBlock).toMatchObject({ item: { kind: 'note', comment } })
  })

  test('a gap block carries the gap kind', () => {
    const blocks = blocksOf(file, [hunkA, hunkB], [], null)
    const gap = blocks.find(b => b.key === 'gap:1')
    expect(gap).toMatchObject({ item: { kind: 'gap' } })
  })

  test('order: title, file comment box, then each hunk with its own comment box, gap between', () => {
    const blocks = blocksOf(file, [hunkA, hunkB], [], null)
    expect(blocks.map(b => b.key)).toEqual([
      TITLE_KEY,
      commentBoxKeyOf({ path: file.path }),
      'hunk:0:@@ -1,2 +1,2 @@',
      commentBoxKeyOf({ path: file.path, hunk: hunkA.header }),
      hunkActionsKeyOf({ path: file.path, hunk: hunkA.header }),
      'gap:1',
      'hunk:1:@@ -10,1 +10,1 @@',
      commentBoxKeyOf({ path: file.path, hunk: hunkB.header }),
      hunkActionsKeyOf({ path: file.path, hunk: hunkB.header }),
    ])
  })

  test('order by item kind mirrors the key order, and exactly one gap sits between two hunks', () => {
    const blocks = blocksOf(file, [hunkA, hunkB], [], null)
    expect(blocks.map(b => (b.kind === 'hunk' ? 'hunk' : b.item.kind))).toEqual([
      'title',
      'comment-box',
      'hunk',
      'comment-box',
      'hunk-actions',
      'gap',
      'hunk',
      'comment-box',
      'hunk-actions',
    ])
    expect(blocks.filter(b => b.kind === 'fixed' && b.item.kind === 'gap')).toHaveLength(1)
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
      commentBoxKeyOf({ path: file.path }),
      'hunk:0:@@ -1,2 +1,2 @@',
      noteKeyOf('hunk-note'),
      commentBoxKeyOf({ path: file.path, hunk: hunkA.header }),
      hunkActionsKeyOf({ path: file.path, hunk: hunkA.header }),
    ])
  })

  test('composing on a hunk is 3 rows (line-picker Select + Input + cancel)', () => {
    const blocks = blocksOf(file, [hunkA], [], { path: file.path, hunk: hunkA.header })
    const fileBox = blocks.find(b => b.key === commentBoxKeyOf({ path: file.path }))
    const hunkBox = blocks.find(
      b => b.key === commentBoxKeyOf({ path: file.path, hunk: hunkA.header }),
    )
    expect(fileBox).toMatchObject({ rows: 1 })
    expect(hunkBox).toMatchObject({ rows: 3 })
  })

  test('composing on the file (no hunk) is 2 rows: no line-picker to draw', () => {
    const blocks = blocksOf(file, [hunkA], [], { path: file.path })
    const fileBox = blocks.find(b => b.key === commentBoxKeyOf({ path: file.path }))
    expect(fileBox).toMatchObject({ rows: 2 })
  })

  test('row total matches title + notes + boxes + hunk lines + gaps + actions rows', () => {
    const comments: Comments = [commentOf({ id: 'n1' })]
    const blocks = blocksOf(file, [hunkA, hunkB], comments, null)
    // title(1) + note(1) + filebox(1) + hunkA(3 lines) + hunkAbox(1) + hunkAactions(1) + gap(1)
    // + hunkB(2 lines) + hunkBbox(1) + hunkBactions(1)
    expect(contentRowsOf(blocks)).toBe(1 + 1 + 1 + 3 + 1 + 1 + 1 + 2 + 1 + 1)
  })

  test('row total with a note and an active compose box together', () => {
    const comments: Comments = [commentOf({ id: 'n1', hunk: hunkA.header })]
    const blocks = blocksOf(file, [hunkA], comments, { path: file.path, hunk: hunkA.header })
    // title(1) + filebox(1) + hunkA(3 lines) + note(1) + composebox(3, with the line picker) + actions(1)
    expect(contentRowsOf(blocks)).toBe(1 + 1 + 3 + 1 + 3 + 1)
  })

  test('an empty, non-binary file with no textual changes gets a status row, no gap or hunk blocks', () => {
    const blocks = blocksOf(file, [], [], null)
    expect(blocks.map(b => b.key)).toEqual([
      TITLE_KEY,
      commentBoxKeyOf({ path: file.path }),
      STATUS_KEY,
    ])
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
      blocks.findIndex(b => b.key === commentBoxKeyOf({ path: file.path, hunk: hunkA.header })),
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

  test('a hunk-actions row follows every hunk, unstaged and not confirming by default', () => {
    const blocks = blocksOf(file, [hunkA, hunkB], [], null)
    const anchorA = { path: file.path, hunk: hunkA.header }
    const anchorB = { path: file.path, hunk: hunkB.header }
    expect(blocks.find(b => b.key === hunkActionsKeyOf(anchorA))).toMatchObject({
      item: { kind: 'hunk-actions', anchor: anchorA, isStaged: false, confirmingRevert: false },
    })
    expect(blocks.find(b => b.key === hunkActionsKeyOf(anchorB))).toMatchObject({
      item: { kind: 'hunk-actions', anchor: anchorB, isStaged: false, confirmingRevert: false },
    })
  })

  test('hunkState marks the staged hunk and the hunk confirming a revert', () => {
    const blocks = blocksOf(file, [hunkA, hunkB], [], null, {
      hunkState: {
        staged: new Set([hunkA.header]),
        confirmingRevert: `${file.path}|${hunkB.header}`,
      },
    })
    const anchorA = { path: file.path, hunk: hunkA.header }
    const anchorB = { path: file.path, hunk: hunkB.header }
    expect(blocks.find(b => b.key === hunkActionsKeyOf(anchorA))).toMatchObject({
      item: { isStaged: true, confirmingRevert: false },
    })
    expect(blocks.find(b => b.key === hunkActionsKeyOf(anchorB))).toMatchObject({
      item: { isStaged: false, confirmingRevert: true },
    })
  })
})

describe('blocksOf for a turn source', () => {
  test('titles the file with the turn index and drops comment/stage/revert rows', () => {
    const blocks = blocksOf(file, [hunkA, hunkB], [], null, { turnIndex: 3, readOnly: true })

    expect(blocks[0]).toMatchObject({ item: { kind: 'title', file, turnIndex: 3 } })
    expect(blocks.some(b => b.key === commentBoxKeyOf({ path: file.path }))).toBe(false)
    expect(
      blocks.some(b => b.key === hunkActionsKeyOf({ path: file.path, hunk: hunkA.header })),
    ).toBe(false)
    expect(blocks.map(b => b.kind)).toEqual(['fixed', 'hunk', 'fixed', 'hunk'])
  })

  test('drops outdated comments too, since a turn has none of its own', () => {
    const stale = commentOf({ hunk: '@@ -99,1 +99,1 @@' })
    const blocks = blocksOf(file, [hunkA], [stale], null, { turnIndex: 1, readOnly: true })

    expect(blocks.some(b => b.key === OUTDATED_TITLE_KEY)).toBe(false)
  })
})

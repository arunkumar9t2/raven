import { describe, expect, test } from 'bun:test'
import type { ChangedFile } from '../../hooks/git/changes'
import type { Hunk } from '../../hooks/git/hunks'
import type { Comment, Comments } from '../../hooks/review/comments'
import {
  blocksOf,
  commentBoxKeyOf,
  noteKeyOf,
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
  })

  test('order: title, file comment box, then each hunk with its own comment box, gap between', () => {
    const blocks = blocksOf(file, [hunkA, hunkB], [], null)
    expect(blocks.map(b => b.key)).toEqual([
      TITLE_KEY,
      commentBoxKeyOf({ path: file.path }),
      'hunk:0:@@ -1,2 +1,2 @@',
      commentBoxKeyOf({ path: file.path, hunk: hunkA.header }),
      'gap:1',
      'hunk:1:@@ -10,1 +10,1 @@',
      commentBoxKeyOf({ path: file.path, hunk: hunkB.header }),
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
      commentBoxKeyOf({ path: file.path }),
      'hunk:0:@@ -1,2 +1,2 @@',
      noteKeyOf('hunk-note'),
      commentBoxKeyOf({ path: file.path, hunk: hunkA.header }),
    ])
  })

  test('the compose box at the composing anchor is 2 rows, every other comment box is 1', () => {
    const blocks = blocksOf(file, [hunkA], [], { path: file.path, hunk: hunkA.header })
    const fileBox = blocks.find(b => b.key === commentBoxKeyOf({ path: file.path }))
    const hunkBox = blocks.find(
      b => b.key === commentBoxKeyOf({ path: file.path, hunk: hunkA.header }),
    )
    expect(fileBox).toMatchObject({ rows: 1 })
    expect(hunkBox).toMatchObject({ rows: 2 })
  })

  test('row total matches title + notes + boxes + hunk lines + gaps', () => {
    const comments: Comments = [commentOf({ id: 'n1' })]
    const blocks = blocksOf(file, [hunkA, hunkB], comments, null)
    // title(1) + note(1) + filebox(1) + hunkA(3 lines) + hunkAbox(1) + gap(1) + hunkB(2 lines) + hunkBbox(1)
    expect(contentRowsOf(blocks)).toBe(1 + 1 + 1 + 3 + 1 + 1 + 2 + 1)
  })

  test('an empty, non-binary file with no textual changes gets a status row, no gap or hunk blocks', () => {
    const blocks = blocksOf(file, [], [], null)
    expect(blocks.map(b => b.key)).toEqual([
      TITLE_KEY,
      commentBoxKeyOf({ path: file.path }),
      STATUS_KEY,
    ])
  })
})

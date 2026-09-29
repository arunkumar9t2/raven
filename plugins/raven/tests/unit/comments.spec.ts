import { describe, expect, test } from 'bun:test'
import {
  addComment,
  addressedIdsOf,
  changedLinesOf,
  commentsFrom,
  commentsOn,
  groupByAnchor,
  removeComment,
  reviewTextOf,
} from '../../hooks/review/comments'

describe('addComment / removeComment', () => {
  test('assigns a unique id and appends', () => {
    let comments = addComment([], { path: 'a.ts', text: 'fix this', createdAt: 1 })
    comments = addComment(comments, { path: 'b.ts', text: 'and this', createdAt: 2 })
    expect(comments).toHaveLength(2)
    expect(new Set(comments.map(c => c.id)).size).toBe(2)
  })

  test('removes by id, leaving others untouched', () => {
    const comments = addComment([], { path: 'a.ts', text: 'x', createdAt: 1 })
    const id = comments[0]?.id as string
    expect(removeComment(comments, id)).toHaveLength(0)
    expect(removeComment(comments, 'missing')).toHaveLength(1)
  })
})

describe('commentsOn', () => {
  test('undefined hunk selects only file-level comments', () => {
    const comments = addComment(
      addComment([], { path: 'a.ts', text: 'file level', createdAt: 1 }),
      { path: 'a.ts', hunk: '@@ -1,2 +1,2 @@', text: 'hunk level', createdAt: 2 },
    )
    expect(commentsOn(comments, 'a.ts')).toHaveLength(1)
    expect(commentsOn(comments, 'a.ts')[0]?.text).toBe('file level')
    expect(commentsOn(comments, 'a.ts', '@@ -1,2 +1,2 @@')).toHaveLength(1)
    expect(commentsOn(comments, 'b.ts')).toHaveLength(0)
  })
})

describe('reviewTextOf', () => {
  test('returns undefined for no comments', () => {
    expect(reviewTextOf([])).toBeUndefined()
  })

  test('orders by path, file-level first, then hunk first-seen, then createdAt', () => {
    let comments: readonly ReturnType<typeof addComment>[number][] = []
    comments = addComment(comments, {
      path: 'b.ts',
      hunk: '@@ -1,1 +1,1 @@',
      text: 'second hunk seen first',
      createdAt: 10,
    })
    comments = addComment(comments, { path: 'a.ts', text: 'a file-level', createdAt: 5 })
    comments = addComment(comments, {
      path: 'b.ts',
      hunk: '@@ -5,1 +5,1 @@',
      text: 'second hunk seen second',
      createdAt: 1,
    })
    comments = addComment(comments, { path: 'b.ts', text: 'b file-level, later', createdAt: 20 })
    comments = addComment(comments, {
      path: 'b.ts',
      hunk: '@@ -1,1 +1,1 @@',
      text: 'earlier by createdAt',
      createdAt: 3,
    })

    const text = reviewTextOf(comments) as string
    expect(text.startsWith("These are the user's review comments")).toBe(true)

    const aIndex = text.indexOf('a.ts')
    const bIndex = text.indexOf('b.ts')
    expect(aIndex).toBeGreaterThan(-1)
    expect(bIndex).toBeGreaterThan(aIndex)

    const bFileLevel = text.indexOf('b file-level, later')
    const firstHunkHeader = text.indexOf('@@ -1,1 +1,1 @@')
    const secondHunkHeader = text.indexOf('@@ -5,1 +5,1 @@')
    expect(bFileLevel).toBeGreaterThan(bIndex)
    expect(firstHunkHeader).toBeGreaterThan(bFileLevel)
    expect(secondHunkHeader).toBeGreaterThan(firstHunkHeader)

    const earlier = text.indexOf('earlier by createdAt')
    const seenFirst = text.indexOf('second hunk seen first')
    expect(earlier).toBeGreaterThan(firstHunkHeader)
    expect(earlier).toBeLessThan(seenFirst)
  })
})

describe('reviewTextOf line anchoring', () => {
  test('quotes the diff line above an indented comment, ending with the id', () => {
    const comments = addComment([], {
      path: 'a.ts',
      hunk: '@@ -1,2 +1,2 @@',
      line: { number: 42, side: 'new', text: 'const x = 1' },
      text: 'rename this',
      createdAt: 1,
    })
    const text = reviewTextOf(comments) as string
    const id = comments[0]?.id as string
    expect(text).toContain('L42 + const x = 1')
    expect(text).toContain(`  - rename this [${id}]`)
    expect(text.indexOf('L42 + const x = 1')).toBeLessThan(text.indexOf('rename this'))
  })

  test('quotes an old-side line with a minus', () => {
    const comments = addComment([], {
      path: 'a.ts',
      hunk: '@@ -1,2 +1,2 @@',
      line: { number: 7, side: 'old', text: 'const y = 2' },
      text: 'why remove this',
      createdAt: 1,
    })
    expect(reviewTextOf(comments)).toContain('L7 - const y = 2')
  })

  test('hunk- and file-level comments without a line still carry the id', () => {
    const comments = addComment([], { path: 'a.ts', text: 'file note', createdAt: 1 })
    const id = comments[0]?.id as string
    expect(reviewTextOf(comments)).toContain(`- file note [${id}]`)
  })
})

describe('changedLinesOf', () => {
  test('numbers +/- lines from the header, leaving context lines out', () => {
    const hunk = {
      header: '@@ -10,3 +10,4 @@',
      text: [
        '@@ -10,3 +10,4 @@',
        ' unchanged',
        '-removed line',
        '+added one',
        '+added two',
        '',
      ].join('\n'),
    }
    expect(changedLinesOf(hunk)).toEqual([
      { number: 11, side: 'old', text: 'removed line' },
      { number: 11, side: 'new', text: 'added one' },
      { number: 12, side: 'new', text: 'added two' },
    ])
  })

  test('an unrecognized header yields no lines', () => {
    expect(changedLinesOf({ header: 'not a header', text: 'not a header\n+x\n' })).toEqual([])
  })

  test('a no-newline marker advances neither counter', () => {
    const hunk = {
      header: '@@ -1,1 +1,2 @@',
      text: ['@@ -1,1 +1,2 @@', '-b', '\\ No newline at end of file', '+b', '+c', ''].join('\n'),
    }
    expect(changedLinesOf(hunk)).toEqual([
      { number: 1, side: 'old', text: 'b' },
      { number: 1, side: 'new', text: 'b' },
      { number: 2, side: 'new', text: 'c' },
    ])
  })
})

describe('groupByAnchor', () => {
  test('splits file-level, live per-hunk, and outdated comments', () => {
    const hunkA = '@@ -1,1 +1,1 @@'
    const hunkB = '@@ -9,1 +9,1 @@'
    let comments = addComment([], { path: 'a.ts', text: 'file note', createdAt: 1 })
    comments = addComment(comments, { path: 'a.ts', hunk: hunkA, text: 'still here', createdAt: 2 })
    comments = addComment(comments, { path: 'a.ts', hunk: hunkB, text: 'stale', createdAt: 3 })

    const grouped = groupByAnchor(comments, [hunkA])
    expect(grouped.file.map(c => c.text)).toEqual(['file note'])
    expect(grouped.byHunk.get(hunkA)?.map(c => c.text)).toEqual(['still here'])
    expect(grouped.byHunk.has(hunkB)).toBe(false)
    expect(grouped.outdated.map(c => c.text)).toEqual(['stale'])
  })
})

describe('addressedIdsOf', () => {
  test('parses a fenced JSON array, keeping only known ids', () => {
    const reply = 'Done.\n```json\n["a", "b", "unknown"]\n```\nThanks.'
    expect(addressedIdsOf(reply, ['a', 'b'])).toEqual(['a', 'b'])
  })

  test('parses a bare array amid prose', () => {
    expect(addressedIdsOf('I addressed ["x"] only.', ['x', 'y'])).toEqual(['x'])
  })

  test('returns empty for no array or invalid JSON', () => {
    expect(addressedIdsOf('no ids here', ['x'])).toEqual([])
    expect(addressedIdsOf('[not json]', ['x'])).toEqual([])
  })

  test('ignores bracketed [id] mentions in prose before a fenced array', () => {
    const reply = 'Addressed [lx1-0] and [lx1-1].\n```json\n["lx1-0","lx1-1"]\n```'
    expect(addressedIdsOf(reply, ['lx1-0', 'lx1-1'])).toEqual(['lx1-0', 'lx1-1'])
  })
})

describe('commentsFrom', () => {
  test('parses a valid stored array', () => {
    const stored = [{ id: '1', path: 'a.ts', text: 'ok', createdAt: 1 }]
    expect(commentsFrom(stored)).toHaveLength(1)
  })

  test('treats a missing status as pending', () => {
    const stored = [{ id: '1', path: 'a.ts', text: 'ok', createdAt: 1 }]
    expect(commentsFrom(stored)[0]?.status).toBe('pending')
  })

  test('drops malformed entries and non-array input', () => {
    const stored = [
      { id: '1', path: 'a.ts', text: 'ok', createdAt: 1 },
      { id: '2', path: 'a.ts', createdAt: 1 },
      { id: '3', text: 'missing path', createdAt: 1 },
      { id: '4', path: 'a.ts', text: 'bad hunk', hunk: 5, createdAt: 1 },
      'not an object',
      null,
    ]
    expect(commentsFrom(stored)).toHaveLength(1)
    expect(commentsFrom(null)).toEqual([])
    expect(commentsFrom({ not: 'an array' })).toEqual([])
  })

  test('round-trips through addComment', () => {
    const comments = addComment([], { path: 'a.ts', text: 'x', createdAt: 1 })
    const restored = commentsFrom(JSON.parse(JSON.stringify(comments)))
    expect(restored).toEqual(comments)
  })
})

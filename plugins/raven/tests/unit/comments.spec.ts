import { describe, expect, test } from 'bun:test'
import {
  addComment,
  commentsFrom,
  commentsOn,
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

describe('commentsFrom', () => {
  test('parses a valid stored array', () => {
    const stored = [{ id: '1', path: 'a.ts', text: 'ok', createdAt: 1 }]
    expect(commentsFrom(stored)).toHaveLength(1)
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

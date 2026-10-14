import { describe, expect, test } from 'bun:test'
import { ELEMENT_TEXT_LIMIT } from '../../hooks/core/view'
import type { Hunk } from '../../hooks/git/hunks'
import { sliceHunk } from '../../hooks/views/diff/layout'
import {
  fileTagOf,
  wholePiecesOf,
  wholeSideOf,
  wholeSourceOf,
} from '../../hooks/views/diff/whole-file'

const hunkOf = (header: string, lines: readonly string[]): Hunk => ({
  header,
  text: `${[header, ...lines].join('\n')}\n`,
})

describe('wholeSourceOf', () => {
  test('an untracked file: the + stripped, numbered from the header, no tail', () => {
    const hunk = hunkOf('@@ -0,0 +1,3 @@', ['+one', '+  two', '+three'])
    expect(wholeSourceOf(hunk, 'new')).toEqual({
      source: 'one\n  two\nthree',
      count: 3,
      startLine: 1,
      tail: [],
    })
  })

  test('a blank line in the file is a bare + and stays a blank source line', () => {
    const hunk = hunkOf('@@ -0,0 +1,3 @@', ['+a', '+', '+c'])
    expect(wholeSourceOf(hunk, 'new')?.source).toBe('a\n\nc')
  })

  test('a "No newline" marker is kept aside as the tail, not drawn as code', () => {
    const hunk = hunkOf('@@ -0,0 +1,2 @@', ['+a', '+b', '\\ No newline at end of file'])
    expect(wholeSourceOf(hunk, 'new')).toEqual({
      source: 'a\nb',
      count: 2,
      startLine: 1,
      tail: ['\\ No newline at end of file'],
    })
  })

  test('a slice from the middle numbers from its own renumbered header', () => {
    const hunk = hunkOf('@@ -0,0 +1,5 @@', ['+l1', '+l2', '+l3', '+l4', '+l5'])
    const slice = sliceHunk(hunk, 2, 4)
    expect(wholeSourceOf(slice, 'new')).toEqual({
      source: 'l3\nl4',
      count: 2,
      startLine: 3,
      tail: [],
    })
  })

  test('a slice that is only the marker has no code rows', () => {
    const hunk = hunkOf('@@ -0,0 +1,2 @@', ['+a', '+b', '\\ No newline at end of file'])
    const slice = sliceHunk(hunk, 2, 3)
    expect(wholeSourceOf(slice, 'new')).toMatchObject({ source: '', count: 0 })
    expect(wholeSourceOf(slice, 'new')?.tail).toHaveLength(1)
  })

  test('a deleted file: the - stripped, numbered from the old side', () => {
    const hunk = hunkOf('@@ -1,2 +0,0 @@', ['-x', '-y'])
    expect(wholeSourceOf(hunk, 'old')).toEqual({
      source: 'x\ny',
      count: 2,
      startLine: 1,
      tail: [],
    })
  })

  test('a deleted file sliced from the middle numbers from the old side', () => {
    const hunk = hunkOf('@@ -10,4 +0,0 @@', ['-a', '-b', '-c', '-d'])
    expect(wholeSourceOf(sliceHunk(hunk, 1, 3), 'old')).toMatchObject({
      source: 'b\nc',
      startLine: 11,
    })
  })

  test('a hunk that is not wholly the expected side is not source', () => {
    expect(wholeSourceOf(hunkOf('@@ -1,2 +1,2 @@', ['+a', ' b']), 'new')).toBeNull()
    expect(wholeSourceOf(hunkOf('@@ -1,2 +1,2 @@', ['-a', '+b']), 'new')).toBeNull()
    expect(wholeSourceOf(hunkOf('@@ -1,1 +0,0 @@', ['-a']), 'new')).toBeNull()
    expect(wholeSourceOf(hunkOf('@@ -0,0 +1,1 @@', ['+a']), 'old')).toBeNull()
  })

  test('a marker followed by more lines, an empty body and a malformed header are not source', () => {
    expect(
      wholeSourceOf(hunkOf('@@ -0,0 +1,2 @@', ['\\ No newline at end of file', '+a']), 'new'),
    ).toBeNull()
    expect(wholeSourceOf(hunkOf('@@ -0,0 +1,0 @@', []), 'new')).toBeNull()
    expect(wholeSourceOf(hunkOf('nonsense', ['+a']), 'new')).toBeNull()
  })
})

describe('wholePiecesOf (the 10 000 character cap)', () => {
  test('600 lines of 40 characters are cut into pieces under the cap, lines and numbering intact', () => {
    const lines = Array.from({ length: 600 }, () => `+${'x'.repeat(39)}`)
    const hunk = hunkOf('@@ -0,0 +1,600 @@', [...lines, '\\ No newline at end of file'])
    const whole = wholeSourceOf(hunk, 'new')
    if (!whole) throw new Error('expected a source')
    expect(whole.source.length).toBeGreaterThan(ELEMENT_TEXT_LIMIT)

    const pieces = wholePiecesOf(whole)
    expect(pieces.length).toBeGreaterThan(1)
    let next = 1
    for (const piece of pieces) {
      expect(piece.source.length).toBeLessThanOrEqual(ELEMENT_TEXT_LIMIT)
      expect(piece.startLine).toBe(next)
      expect(piece.source.split('\n')).toHaveLength(piece.count)
      next += piece.count
    }
    expect(next - 1).toBe(600)
    // The marker belongs to the last piece only.
    expect(pieces.slice(0, -1).every(piece => piece.tail.length === 0)).toBe(true)
    expect(pieces[pieces.length - 1]?.tail).toHaveLength(1)
  })

  test('a source under the cap is one piece, unchanged', () => {
    const whole = { source: 'a\nb', count: 2, startLine: 4, tail: [] }
    expect(wholePiecesOf(whole)).toEqual([whole])
  })

  test('a marker-only view stays one piece', () => {
    const whole = { source: '', count: 0, startLine: 3, tail: ['\\ No newline at end of file'] }
    expect(wholePiecesOf(whole)).toEqual([whole])
  })
})

describe('wholeSideOf / fileTagOf', () => {
  test('untracked and staged-new files are new; a deleted file is old; the rest are diffs', () => {
    expect(wholeSideOf('untracked')).toBe('new')
    expect(wholeSideOf('added')).toBe('new')
    expect(wholeSideOf('deleted')).toBe('old')
    expect(wholeSideOf('modified')).toBeUndefined()
    expect(wholeSideOf('renamed')).toBeUndefined()
  })

  test('the title tag names a new or deleted file and nothing else', () => {
    expect(fileTagOf('untracked')).toBe('new file')
    expect(fileTagOf('added')).toBe('new file')
    expect(fileTagOf('deleted')).toBe('deleted')
    expect(fileTagOf('modified')).toBeNull()
    expect(fileTagOf('renamed')).toBeNull()
  })
})

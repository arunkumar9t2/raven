import { describe, expect, test } from 'bun:test'
import type { Comment } from '../../hooks/review/comments'
import { resolvePromptOf } from '../../hooks/review/resolve'

function commentOf(patch: Partial<Comment>): Comment {
  return { id: 'c1', path: 'a.ts', text: 'fix this', status: 'sent', createdAt: 0, ...patch }
}

describe('resolvePromptOf', () => {
  test('lists each comment as [id] path: text', () => {
    const prompt = resolvePromptOf([commentOf({ id: 'x1', path: 'a.ts', text: 'rename this' })])
    expect(prompt).toContain('[x1] a.ts: rename this')
  })

  test('a line-anchored comment carries its line number', () => {
    const prompt = resolvePromptOf([
      commentOf({ id: 'x2', path: 'b.ts', line: { number: 42, side: 'new', text: 'x' } }),
    ])
    expect(prompt).toContain('[x2] b.ts L42: fix this')
  })

  test('asks for a JSON array of addressed ids', () => {
    const prompt = resolvePromptOf([commentOf({})])
    expect(prompt).toMatch(/JSON array/)
  })

  test('lists several comments each on their own line, in order', () => {
    const prompt = resolvePromptOf([
      commentOf({ id: 'a', path: 'a.ts', text: 'one' }),
      commentOf({ id: 'b', path: 'b.ts', text: 'two' }),
    ])
    const first = prompt.indexOf('[a] a.ts: one')
    const second = prompt.indexOf('[b] b.ts: two')
    expect(first).toBeGreaterThan(-1)
    expect(second).toBeGreaterThan(first)
  })
})

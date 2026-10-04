import { describe, expect, test } from 'bun:test'
import { labelOf } from '../../hooks/views/doc-view'

describe('labelOf', () => {
  test('a file inside the session directory shows relative to it', () => {
    expect(labelOf('/work/repo/docs/plan.md', '/work/repo')).toBe('docs/plan.md')
  })

  test('a file outside it keeps its path', () => {
    expect(labelOf('/tmp/notes/plan.md', '/work/repo')).toBe('/tmp/notes/plan.md')
  })

  test('a sibling directory sharing the prefix is not inside it', () => {
    expect(labelOf('/work/repo-two/a.md', '/work/repo')).toBe('/work/repo-two/a.md')
  })
})

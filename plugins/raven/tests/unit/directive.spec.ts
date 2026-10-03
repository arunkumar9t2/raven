import { describe, expect, test } from 'bun:test'
import { directiveOf } from '../../hooks/core/directive'

describe('directiveOf open', () => {
  for (const pane of ['diff', 'doc', 'files', 'tasks'] as const) {
    test(`parses open ${pane}`, () => {
      expect(directiveOf({ op: 'open', pane })).toEqual({ op: 'open', pane })
    })
  }

  test('rejects a missing pane', () => {
    expect(directiveOf({ op: 'open' })).toBeNull()
  })

  test('rejects an unknown or non-string pane', () => {
    expect(directiveOf({ op: 'open', pane: 'nonsense' })).toBeNull()
    expect(directiveOf({ op: 'open', pane: 3 })).toBeNull()
  })
})

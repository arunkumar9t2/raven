import { describe, expect, test } from 'bun:test'
import { scopeOf } from '../../hooks/ui/scope'

describe('scopeOf', () => {
  test('a short key passes through unchanged', () => {
    expect(scopeOf('header:actions')).toBe('header:actions')
  })

  test('a key at exactly 64 characters passes through unchanged', () => {
    const key = 'x'.repeat(64)
    expect(scopeOf(key)).toBe(key)
    expect(scopeOf(key)).toHaveLength(64)
  })

  test('output is always 1 to 64 printable characters, for a 300-char key', () => {
    const key = `hunk-header:${'src/very/deeply/nested/module/path/File.kt'.repeat(6)}|@@ -1,2 +1,2 @@ someLongFunctionContextSuffix`
    expect(key.length).toBeGreaterThan(64)
    const scope = scopeOf(key)
    expect(scope.length).toBeGreaterThanOrEqual(1)
    expect(scope.length).toBeLessThanOrEqual(64)
    expect(/^[\x20-\x7e]+$/.test(scope)).toBe(true)
  })

  test('stable: the same long key always maps to the same scope', () => {
    const key = `hunk-header:${'a'.repeat(300)}`
    expect(scopeOf(key)).toBe(scopeOf(key))
  })

  test('distinct long keys map to distinct scopes, in a small sample', () => {
    const keys = Array.from({ length: 20 }, (_, i) => `hunk-header:${'a'.repeat(200)}${i}`)
    const scopes = new Set(keys.map(scopeOf))
    expect(scopes.size).toBe(keys.length)
  })

  test('an empty key still returns 1 to 64 characters', () => {
    const scope = scopeOf('')
    expect(scope.length).toBeGreaterThanOrEqual(1)
    expect(scope.length).toBeLessThanOrEqual(64)
  })
})

import { describe, expect, test } from 'bun:test'
import { scopeOf } from '../../hooks/ui/scope'

/** Any C0/DEL/`\p{Cc}` control character — the engine's own "no control characters" rule. */
const CONTROL_CHAR = /\p{Cc}/u

/** True if `s` contains a high surrogate with no following low surrogate, or a bare low one. */
function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = s.charCodeAt(i + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      i++
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true
    }
  }
  return false
}

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

  test('a short key containing a tab yields no control character', () => {
    const key = 'a\tb'
    expect(key.length).toBeLessThanOrEqual(64)
    const scope = scopeOf(key)
    expect(CONTROL_CHAR.test(scope)).toBe(false)
    expect(scope.length).toBeGreaterThanOrEqual(1)
    expect(scope.length).toBeLessThanOrEqual(64)
  })

  test('a long key with a newline inside the first 56 characters yields none', () => {
    const key = `aaaaaaaaaa\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`
    expect(key.length).toBeGreaterThan(64)
    const scope = scopeOf(key)
    expect(CONTROL_CHAR.test(scope)).toBe(false)
  })

  test('a long key whose 56th unit falls in the middle of an emoji leaves no lone surrogate', () => {
    const key = `${'a'.repeat(55)}😀${'b'.repeat(10)}`
    expect(key.length).toBeGreaterThan(64)
    const scope = scopeOf(key)
    expect(hasLoneSurrogate(scope)).toBe(false)
  })

  test('every output satisfies the engine rule: 1 to 64 characters, no control characters', () => {
    const keys = [
      '',
      'short',
      'with\tcontrol',
      'x'.repeat(64),
      'x'.repeat(65),
      `${'a'.repeat(300)}\n\t${'b'.repeat(50)}`,
      `${'a'.repeat(55)}😀${'b'.repeat(200)}`,
    ]
    for (const key of keys) {
      const scope = scopeOf(key)
      expect(scope.length).toBeGreaterThanOrEqual(1)
      expect(scope.length).toBeLessThanOrEqual(64)
      expect(CONTROL_CHAR.test(scope)).toBe(false)
      expect(hasLoneSurrogate(scope)).toBe(false)
    }
  })
})

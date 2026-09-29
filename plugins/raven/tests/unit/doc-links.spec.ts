import { describe, expect, test } from 'bun:test'

import { resolveDocLink } from '../../hooks/views/doc-links'

const DOC = '/tmp/sandbox/sub/doc.md'

describe('resolveDocLink', () => {
  test('resolves a relative link against the doc directory', () => {
    expect(resolveDocLink(DOC, 'other.md')).toBe('/tmp/sandbox/sub/other.md')
  })

  test('resolves ./ the same as bare relative', () => {
    expect(resolveDocLink(DOC, './other.md')).toBe('/tmp/sandbox/sub/other.md')
  })

  test('resolves ../ up a directory', () => {
    expect(resolveDocLink(DOC, '../top.md')).toBe('/tmp/sandbox/top.md')
  })

  test('strips a #fragment before resolving', () => {
    expect(resolveDocLink(DOC, 'other.md#section')).toBe('/tmp/sandbox/sub/other.md')
  })

  test('a bare fragment resolves to nothing', () => {
    expect(resolveDocLink(DOC, '#section')).toBeNull()
  })

  test('resolves a file:// link to its absolute path', () => {
    expect(resolveDocLink(DOC, 'file:///abs/path.md')).toBe('/abs/path.md')
  })

  test('an absolute path link is used as-is, normalized', () => {
    expect(resolveDocLink(DOC, '/abs/../abs2/x.md')).toBe('/abs2/x.md')
  })

  test('http and https links are not resolved', () => {
    expect(resolveDocLink(DOC, 'http://example.com')).toBeNull()
    expect(resolveDocLink(DOC, 'https://example.com/page#frag')).toBeNull()
  })
})

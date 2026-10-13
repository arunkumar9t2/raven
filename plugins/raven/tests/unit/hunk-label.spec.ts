import { describe, expect, test } from 'bun:test'
import { hunkLabelOf, isProsePath } from '../../hooks/views/diff/hunk-label'

describe('isProsePath', () => {
  test('prose extensions', () => {
    for (const path of [
      'README.md',
      'docs/plan.mdx',
      'notes.txt',
      'a/b/guide.rst',
      'spec.adoc',
      'x.markdown',
      'UPPER.MD',
    ]) {
      expect(isProsePath(path)).toBe(true)
    }
  })

  test('extensionless files and dotfiles are prose', () => {
    for (const path of ['LICENSE', 'docs/CHANGELOG', '.gitignore', '.env']) {
      expect(isProsePath(path)).toBe(true)
    }
  })

  test('an extension with no recognised code language is prose', () => {
    for (const path of ['data.csv', 'build.log', 'notes.snap', 'a.unknownext']) {
      expect(isProsePath(path)).toBe(true)
    }
  })

  test('code languages are not prose', () => {
    for (const path of [
      'a.ts',
      'src/b.tsx',
      'c.py',
      'd.rs',
      'e.kt',
      'f.go',
      'g.rb',
      'h.cs',
      'i.json',
      'j.yml',
      'k.sh',
      'l.css',
      'm.sql',
    ]) {
      expect(isProsePath(path)).toBe(false)
    }
  })

  test('named build files and shell dotfiles are code, even without an extension', () => {
    for (const path of ['Dockerfile', 'sub/Makefile', 'CMakeLists.txt', '.bashrc', 'Gemfile']) {
      expect(isProsePath(path)).toBe(false)
    }
  })
})

describe('hunkLabelOf', () => {
  const hunk = (header: string) => ({ header, text: `${header}\n x\n` })

  test('code: the function context, then the new-side range', () => {
    expect(hunkLabelOf(hunk('@@ -1,5 +1,7 @@ function handleRequest(req) {'), 'a.ts')).toBe(
      'ƒ function handleRequest(req)  L1–7',
    )
  })

  test('code without a context is the bare range', () => {
    expect(hunkLabelOf(hunk('@@ -10,3 +12,4 @@'), 'a.ts')).toBe('L12–15')
  })

  test('prose drops the context git picked', () => {
    const header = '@@ -3,4 +3,6 @@ A diff pane that sits next to Claude Code.'
    expect(hunkLabelOf(hunk(header), 'README.md')).toBe('L3–8')
    expect(hunkLabelOf(hunk(header), 'docs/plan.txt')).toBe('L3–8')
    expect(hunkLabelOf(hunk(header), 'LICENSE')).toBe('L3–8')
  })

  test('a one-line hunk or a deletion-only hunk is a one-line range', () => {
    expect(hunkLabelOf(hunk('@@ -5 +5 @@'), 'a.ts')).toBe('L5–5')
    expect(hunkLabelOf(hunk('@@ -5,2 +5,0 @@'), 'a.ts')).toBe('L5–5')
  })

  test('a header that does not parse has no label', () => {
    expect(hunkLabelOf(hunk('not a header'), 'a.ts')).toBe('')
  })
})

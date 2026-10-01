import { describe, expect, test } from 'bun:test'

import { docBlocksOf, markdownChunksOf } from '../../hooks/views/markdown-chunks'

describe('markdownChunksOf', () => {
  test('short markdown is one chunk', () => {
    expect(markdownChunksOf('# Title\n\nbody')).toEqual(['# Title\n\nbody'])
  })

  test('every chunk fits and nothing is lost', () => {
    const paragraphs = Array.from(
      { length: 40 },
      (_, i) => `## Section ${i}\n\n${'word '.repeat(60)}`,
    )
    const markdown = paragraphs.join('\n\n')
    const chunks = markdownChunksOf(markdown, 1000)

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(1000)
    const words = (text: string) => text.replace(/\s+/g, ' ').trim()
    expect(words(chunks.join('\n\n'))).toBe(words(markdown))
  })

  test('a cut inside a code fence closes and reopens it', () => {
    const code = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
    const chunks = markdownChunksOf(`intro\n\n\`\`\`ts\n${code}\n\`\`\`\n\nafter`, 300)

    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(300)
      expect((chunk.match(/^```/gm) ?? []).length % 2).toBe(0)
    }
  })

  test('a single overlong line is truncated to fit', () => {
    const [chunk] = markdownChunksOf('x'.repeat(5000), 1000)
    expect(chunk?.length).toBeLessThanOrEqual(1000)
  })
})

describe('docBlocksOf', () => {
  test('splits prose and a fenced block, keeping the language', () => {
    expect(docBlocksOf('# Title\n\nSome text\n\n```ts\nconst x = 1\n```\n\nAfter')).toEqual([
      { kind: 'markdown', text: '# Title\n\nSome text' },
      { kind: 'code', text: 'const x = 1', language: 'ts' },
      { kind: 'markdown', text: 'After' },
    ])
  })

  test('a fence with no language and a tilde fence are code too', () => {
    expect(docBlocksOf('```\na\n```\n~~~\nb\n~~~')).toEqual([
      { kind: 'code', text: 'a' },
      { kind: 'code', text: 'b' },
    ])
  })

  test('a fence markdownChunksOf closed and reopened across a cut stays code in both chunks', () => {
    const chunks = markdownChunksOf(`\`\`\`ts\n${'x\n'.repeat(30)}\`\`\``, 40)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(docBlocksOf(chunk).every(block => block.kind === 'code')).toBe(true)
    }
  })

  test('an unclosed fence runs to the end as code', () => {
    expect(docBlocksOf('Intro\n\n```py\nprint(1)')).toEqual([
      { kind: 'markdown', text: 'Intro' },
      { kind: 'code', text: 'print(1)', language: 'py' },
    ])
  })

  test('a fenced block containing a ```ts line is one code block, not closed early', () => {
    expect(docBlocksOf('```\nSee:\n```ts\nconst x = 1\n```')).toEqual([
      { kind: 'code', text: 'See:\n```ts\nconst x = 1' },
    ])
  })
})

import { describe, expect, test } from 'bun:test'

import { markdownChunksOf } from '../../hooks/views/markdown-chunks'

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

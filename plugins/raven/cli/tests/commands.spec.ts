import { describe, expect, test } from 'bun:test'
import { type Io, run } from '../src/commands'

function fakeIo(opts: {
  cwd?: string
  stdin?: string
  files?: Record<string, 'file' | 'dir'>
}): Io & { stdoutLines: string[]; stderrLines: string[] } {
  const stdoutLines: string[] = []
  const stderrLines: string[] = []
  return {
    cwd: opts.cwd ?? '/work',
    stdout: s => stdoutLines.push(s),
    stderr: s => stderrLines.push(s),
    readStdin: async () => opts.stdin ?? '',
    exists: async path => opts.files?.[path] ?? null,
    stdoutLines,
    stderrLines,
  }
}

describe('show', () => {
  test('errors when the path is missing', async () => {
    const io = fakeIo({ files: {} })
    const code = await run(['show', '/work/nope.md'], io)
    expect(code).toBe(1)
    expect(io.stdoutLines).toEqual([])
    expect(io.stderrLines.join('')).toContain('does not exist')
  })

  test('errors when the path is a directory', async () => {
    const io = fakeIo({ files: { '/work/dir': 'dir' } })
    const code = await run(['show', '/work/dir'], io)
    expect(code).toBe(1)
    expect(io.stderrLines.join('')).toContain('is a directory')
  })

  test('resolves a relative path against cwd and prints the directive then fallback', async () => {
    const io = fakeIo({ cwd: '/work', files: { '/work/docs/spec.md': 'file' } })
    const code = await run(['show', 'docs/spec.md'], io)
    expect(code).toBe(0)
    expect(io.stdoutLines[0]).toBe('::raven::{"op":"show","path":"/work/docs/spec.md"}\n')
    expect(io.stdoutLines[1]).toContain('Raven pane is not active')
    expect(io.stdoutLines[1]).toContain('older than 2.1.287')
    expect(io.stdoutLines[1]).toContain('CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1')
  })

  test('carries an optional title', async () => {
    const io = fakeIo({ files: { '/work/a.md': 'file' } })
    await run(['show', '/work/a.md', '--title', 'Plan'], io)
    expect(io.stdoutLines[0]).toBe('::raven::{"op":"show","path":"/work/a.md","title":"Plan"}\n')
  })

  test('errors with no path given', async () => {
    const io = fakeIo({})
    const code = await run(['show'], io)
    expect(code).toBe(1)
  })
})

describe('note', () => {
  test('takes markdown from the argument', async () => {
    const io = fakeIo({})
    const code = await run(['note', '# Hello'], io)
    expect(code).toBe(0)
    expect(io.stdoutLines[0]).toBe('::raven::{"op":"note","markdown":"# Hello"}\n')
  })

  test('reads stdin when the argument is absent', async () => {
    const io = fakeIo({ stdin: '# From stdin\n' })
    const code = await run(['note'], io)
    expect(code).toBe(0)
    expect(io.stdoutLines[0]).toBe('::raven::{"op":"note","markdown":"# From stdin"}\n')
  })

  test('reads stdin when the argument is "-"', async () => {
    const io = fakeIo({ stdin: 'piped' })
    await run(['note', '-'], io)
    expect(io.stdoutLines[0]).toBe('::raven::{"op":"note","markdown":"piped"}\n')
  })

  test('carries an optional title alongside stdin', async () => {
    const io = fakeIo({ stdin: 'body' })
    await run(['note', '--title', 'T'], io)
    expect(io.stdoutLines[0]).toBe('::raven::{"op":"note","markdown":"body","title":"T"}\n')
  })

  test('empty markdown is an error', async () => {
    const io = fakeIo({ stdin: '   ' })
    const code = await run(['note'], io)
    expect(code).toBe(1)
    expect(io.stdoutLines).toEqual([])
    expect(io.stderrLines.join('')).toContain('empty')
  })
})

describe('diff', () => {
  test('with no path', async () => {
    const io = fakeIo({})
    const code = await run(['diff'], io)
    expect(code).toBe(0)
    expect(io.stdoutLines[0]).toBe('::raven::{"op":"diff"}\n')
  })

  test('resolves a relative path even when it does not exist', async () => {
    const io = fakeIo({ cwd: '/work' })
    await run(['diff', 'gone.ts'], io)
    expect(io.stdoutLines[0]).toBe('::raven::{"op":"diff","path":"/work/gone.ts"}\n')
  })
})

describe('comments', () => {
  test('prints the directive and a no-pane fallback', async () => {
    const io = fakeIo({})
    const code = await run(['comments'], io)
    expect(code).toBe(0)
    expect(io.stdoutLines[0]).toBe('::raven::{"op":"comments"}\n')
    expect(io.stdoutLines[1]).toContain('no pending comments')
  })
})

describe('help and misc', () => {
  test('no args prints usage', async () => {
    const io = fakeIo({})
    const code = await run([], io)
    expect(code).toBe(0)
    expect(io.stdoutLines.join('')).toContain('Usage:')
  })

  test('help prints usage', async () => {
    const io = fakeIo({})
    const code = await run(['help'], io)
    expect(code).toBe(0)
    expect(io.stdoutLines.join('')).toContain('Usage:')
  })

  test('--help prints usage', async () => {
    const io = fakeIo({})
    const code = await run(['--help'], io)
    expect(code).toBe(0)
    expect(io.stdoutLines.join('')).toContain('Usage:')
  })

  test('--version prints the version', async () => {
    const io = fakeIo({})
    const code = await run(['--version'], io)
    expect(code).toBe(0)
    expect(io.stdoutLines).toEqual(['0.1.0\n'])
  })

  test('unknown command exits 2 with usage on stderr', async () => {
    const io = fakeIo({})
    const code = await run(['bogus'], io)
    expect(code).toBe(2)
    expect(io.stdoutLines).toEqual([])
    expect(io.stderrLines.join('')).toContain('Usage:')
  })
})

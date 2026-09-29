import type { On } from 'claude-code'
import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
const FALLBACK = 'Raven pane is not active; x was not shown. (Enable function hooks)'

/** A world outside any git repository, whose Bash calls print `stdout`. */
function world(on: On, stdout: string) {
  mock.clock(on)
  mock.store(on, {})
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'not a repo' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('tool.call', () => ({ result: { stdout, stderr: '', interrupted: false }, text: stdout }))
}

describe('register', () => {
  test('a directive and its fallback give way to the ack', async ($, on) => {
    world(on, `::raven::{"op":"comments"}\n${FALLBACK}\n`)

    await $.session.start(SESSION)
    const result = await $.tool.call({ tool: 'Bash', command: 'raven comments' })

    expect(result.text).toBe('The user has no pending review comments.')
  })

  test('the rest of a command that also printed a directive is kept', async ($, on) => {
    world(on, `building\n::raven::{"op":"comments"}\n${FALLBACK}\ntests passed\n`)

    await $.session.start(SESSION)
    const result = await $.tool.call({ tool: 'Bash', command: 'make && raven comments' })

    expect(result.text).toBe('building\ntests passed\nThe user has no pending review comments.')
  })

  test('a Bash call without a directive keeps its result', async ($, on) => {
    world(on, 'hello\n')

    await $.session.start(SESSION)
    const result = await $.tool.call({ tool: 'Bash', command: 'echo hello' })

    expect(result.text).toBe('hello\n')
  })
})

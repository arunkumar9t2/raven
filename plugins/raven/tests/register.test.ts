import { describe, expect, mock, test, tier } from 'claude-code/testing'

tier('user')

const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

describe('register', () => {
  test('a Bash call printing a directive has its result replaced', async ($, on) => {
    mock.clock(on)
    mock.store(on, {})
    on('session.start', ($, e) => ({ cwd: e.cwd }))
    on('command.register', ($, e) => ({ value: { command: e.name } }))
    on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'not a repo' } }))
    on('ui.invalidate', () => ({ value: undefined }))
    on('tool.call', () => ({
      result: {
        stdout: '::raven::{"op":"comments"}\nfallback text\n',
        stderr: '',
        interrupted: false,
      },
    }))

    await $.session.start(SESSION)
    const result = await $.tool.call({ tool: 'Bash', command: 'raven comments' })

    expect(result.text).toBe('The user has no pending review comments.')
  })
})

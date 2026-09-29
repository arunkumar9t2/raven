import type { CommandRunInput, On } from 'claude-code'
import { describe, type Engine, expect, mock, test, tier } from 'claude-code/testing'
import { DIFF_PANE, NAME } from '../hooks/names'

tier('user')

const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
const REPO = '/work'

const ravenCommand = (args: string): CommandRunInput => ({
  command: 'raven',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
})

/** A world inside a git repo with one modified file, no hunks: enough to draw the diff pane. */
function world(on: On) {
  mock.clock(on)
  mock.store(on, {})
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__${$.plugin.name}__${e.name}` } }))
  on('session.messages', () => ({ value: [] }))
  on('process.run', ($, e) => {
    const [cmd, sub] = e.argv
    if (cmd === 'git' && sub === 'rev-parse' && e.argv.includes('--show-toplevel')) {
      return { value: { exitCode: 0, stdout: REPO, stderr: '' } }
    }
    if (cmd === 'git' && sub === 'status') {
      return { value: { exitCode: 0, stdout: ' M a.ts\0', stderr: '' } }
    }
    if (cmd === 'git' && e.argv.includes('--numstat')) {
      return { value: { exitCode: 0, stdout: '1\t1\ta.ts\0', stderr: '' } }
    }
    return { value: { exitCode: 1, stdout: '', stderr: '' } }
  })

  const shown = new Set<string>()
  on('ui.open', ($, e) => {
    shown.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    shown.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...shown].map(id => ({
      id,
      title: id,
      isShown: true,
      isFocused: false,
      isPlaced: true,
    })),
  }))
  on('ui.focus', () => ({}))
}

const PANE_PROPS = {
  title: 'Diff',
  isFocused: false,
  bodyColumns: 100,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

describe('surface safety', () => {
  test('the diff pane draws on both terminal and mobile, mobile carrying no Input', async ($: Engine, on: On) => {
    world(on)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    for (const surface of ['terminal', 'mobile'] as const) {
      const ui = await $.ui.mount({
        plugin: NAME,
        surface,
        component: 'Pane',
        props: PANE_PROPS,
        requestId: DIFF_PANE.id,
      })

      await expect(ui.drawn()).resolves.toBeDefined()
      expect(await ui.find({ text: 'a.ts' })).toBeDefined()

      if (surface === 'mobile') {
        expect(await ui.findAll({ type: 'Input' })).toHaveLength(0)
      }

      await ui.unmount()
    }
  })
})

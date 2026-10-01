import type { CommandRunInput, On } from 'claude-code'
import { mock } from 'claude-code/testing'

/** A `process.run` resolution shaped like the engine's real `RunResult`. */
export const ran = (exitCode: number, stdout = '', stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

export const REPO = '/work'

export const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const

export const ravenCommand = (args: string): CommandRunInput => ({
  command: 'raven',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
})

export const PANE_PROPS = {
  title: 'Diff',
  isFocused: false,
  bodyColumns: 100,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

/** The stubs every world needs: the clock/store, and session/command/tool registration. */
export function baseWorld(on: On, storeEntries: Record<string, unknown> = {}) {
  mock.clock(on)
  mock.store(on, storeEntries)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__${$.plugin.name}__${e.name}` } }))
}

/**
 * Tracks panes currently shown (opened minus closed) via `ui.open`/`ui.close`/`ui.panes`/`ui.focus`
 * stubs. `extraShownIds` are reported shown without this instance ever having opened them, e.g. to
 * simulate the engine reporting a pane shown across a hot reload.
 */
export function trackShownPanes(on: On, extraShownIds: readonly string[] = []) {
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
    value: [...new Set([...shown, ...extraShownIds])].map(id => ({
      id,
      title: id,
      isShown: true,
      isFocused: false,
      isPlaced: true,
    })),
  }))
  on('ui.focus', () => ({}))
  return shown
}

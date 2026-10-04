import type { CommandRunInput, On } from 'claude-code'
import { type MockClock, mock } from 'claude-code/testing'

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

/**
 * The stubs every world needs: the clock/store, and session/command/tool registration.
 *
 * @returns the clock, for a test that needs to advance it past a debounce.
 */
export function baseWorld(on: On, storeEntries: Record<string, unknown> = {}): MockClock {
  const clock = mock.clock(on)
  mock.store(on, storeEntries)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__${$.plugin.name}__${e.name}` } }))
  return clock
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

/** The slice of a mounted drawing the pill helpers use. */
type PillUi = {
  findAll: (query: {
    type?: string
    key?: string
    in?: string
  }) => Promise<{ key: string | undefined; props: Record<string, unknown>; text: string }[]>
  find: (query: {
    type?: string
    key?: string
    in?: string
    text?: string | RegExp
  }) => Promise<{ text: string; props: Record<string, unknown> } | undefined>
  post: (data: { press: string }, scope: { in: string }) => Promise<void>
}

/** The `Client` strip that draws the pill `id`, or undefined when none does. */
async function clientOf(ui: PillUi, id: string): Promise<string | undefined> {
  const needle = `"id":${JSON.stringify(id)}`
  for (const client of await ui.findAll({ type: 'Client' })) {
    if (client.key !== undefined && JSON.stringify(client.props.props).includes(needle)) {
      return client.key
    }
  }
  return undefined
}

/** Presses the pill `id` as a left click on it does: a post to the strip that draws it. */
export async function pressPill(ui: PillUi, id: string): Promise<void> {
  const client = await clientOf(ui, id)
  if (client === undefined) throw new Error(`no pill "${id}" is drawn`)
  await ui.post({ press: id }, { in: client })
}

/** What every strip in the drawing shows, joined — for "this label is on screen" checks. */
export async function pillsText(ui: PillUi): Promise<string> {
  const parts: string[] = []
  for (const client of await ui.findAll({ type: 'Client' })) {
    if (client.key === undefined) continue
    parts.push((await ui.find({ in: client.key, type: 'Box' }))?.text ?? '')
  }
  return parts.join('\n')
}

/** One strip segment as `find` reports it inside a Client's props. */
export type PillSeg = { t: string; id?: string; bg?: string; c?: string }

/** The pill segment `id` as the strip's props carry it, or undefined when none is drawn. */
export async function pillOf(ui: PillUi, id: string): Promise<PillSeg | undefined> {
  for (const client of await ui.findAll({ type: 'Client' })) {
    const props = client.props.props as
      | { rows?: { left?: PillSeg[]; right?: PillSeg[] }[] }
      | undefined
    for (const row of props?.rows ?? []) {
      for (const seg of [...(row.left ?? []), ...(row.right ?? [])]) {
        if (seg.id === id) return seg
      }
    }
  }
  return undefined
}

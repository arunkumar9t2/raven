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

/** The slice of a mounted drawing the strip helpers use. */
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

/** One strip segment as `find` reports it inside a Client's props. */
export type PillSeg = { t: string; id?: string; bg?: string; c?: string; dim?: boolean }

/** One strip row as the Client's props carry it. */
export type StripRowOf = { id?: string; left: PillSeg[]; right?: PillSeg[] }

/** A drawn strip: its `Client` key and props (the rows, and the active/hover colours). */
export type StripOf = {
  key: string
  rows: StripRowOf[]
  activeId?: string
  activeBg?: string
  rowHoverBg?: string
}

/** Every `Client` strip in the drawing, parsed: the one source the helpers below filter. */
export async function stripsOf(ui: PillUi): Promise<StripOf[]> {
  const out: StripOf[] = []
  for (const client of await ui.findAll({ type: 'Client' })) {
    if (client.key === undefined) continue
    const props = (client.props.props ?? {}) as Omit<StripOf, 'key' | 'rows'> & {
      rows?: StripRowOf[]
    }
    out.push({
      key: client.key,
      rows: props.rows ?? [],
      activeId: props.activeId,
      activeBg: props.activeBg,
      rowHoverBg: props.rowHoverBg,
    })
  }
  return out
}

const segsOf = (row: StripRowOf): PillSeg[] => [...row.left, ...(row.right ?? [])]

/** Presses the pill (or row) `id` as a left click on it does: a post to the strip that draws it. */
export async function pressPill(ui: PillUi, id: string): Promise<void> {
  const client = (await stripsOf(ui)).find(strip =>
    strip.rows.some(row => row.id === id || segsOf(row).some(seg => seg.id === id)),
  )
  if (client === undefined) throw new Error(`no pill "${id}" is drawn`)
  await ui.post({ press: id }, { in: client.key })
}

/** What every strip in the drawing shows, joined, for "this label is on screen" checks. */
export async function pillsText(ui: PillUi): Promise<string> {
  const parts: string[] = []
  for (const strip of await stripsOf(ui)) {
    parts.push((await ui.find({ in: strip.key, type: 'Box' }))?.text ?? '')
  }
  return parts.join('\n')
}

/** The pill segment `id` as the strip's props carry it, or undefined when none is drawn. */
export async function pillOf(ui: PillUi, id: string): Promise<PillSeg | undefined> {
  return (await allSegs(ui)).find(seg => seg.id === id)
}

/** The strip row `id` (a list row's press id) with its strip's colours, or undefined. */
export async function stripRowOf(
  ui: PillUi,
  id: string,
): Promise<(StripRowOf & Omit<StripOf, 'key' | 'rows'>) | undefined> {
  for (const { rows, key: _key, ...colours } of await stripsOf(ui)) {
    const found = rows.find(row => row.id === id)
    if (found) return { ...found, ...colours }
  }
  return undefined
}

/** The text a strip row draws (left then right, joined), or undefined when no such row is drawn. */
export async function rowText(ui: PillUi, id: string): Promise<string | undefined> {
  const row = await stripRowOf(ui, id)
  return row
    ? segsOf(row)
        .map(seg => seg.t)
        .join('')
    : undefined
}

/** Every segment of every strip in the drawing, in order. */
export async function allSegs(ui: PillUi): Promise<PillSeg[]> {
  return (await stripsOf(ui)).flatMap(strip => strip.rows.flatMap(segsOf))
}

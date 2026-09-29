import type { PaneOpenArgs, Timer } from 'claude-code'

export type RunResult = { exitCode: number; stdout: string; stderr: string }

/**
 * The slice of the engine Raven uses, bound once from `$` at `session.start`. Controllers and
 * views take a Host rather than `$`, so they can be driven by a fake in unit tests.
 */
export type Host = {
  run: (argv: readonly string[]) => Promise<RunResult>
  readFile: (path: string) => Promise<string>
  after: (ms: number, fn: () => void) => Timer
  redraw: () => void
  /** Resolves false when the engine left the pane waiting undrawn (too narrow to dock). */
  openPane: (pane: PaneOpenArgs) => Promise<boolean>
  closePane: (id: string) => Promise<void>
  /** Moves keyboard focus to the element drawn under `key` in pane `paneId`. */
  focus: (paneId: string, key: string) => Promise<void>
  status: (text: string | undefined) => void
  toast: (text: string) => void
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  submitPrompt: (text: string) => Promise<void>
}

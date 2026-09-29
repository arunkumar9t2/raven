import type { PaneOpenArgs, SessionMessage, Timer } from 'claude-code'

export type RunResult = { exitCode: number; stdout: string; stderr: string }

/**
 * The slice of the engine Raven uses, bound once from `$` at `session.start`. Controllers and
 * views take a Host rather than `$`, so they can be driven by a fake in unit tests.
 */
export type Host = {
  run: (argv: readonly string[], stdin?: string) => Promise<RunResult>
  readFile: (path: string) => Promise<string>
  after: (ms: number, fn: () => void) => Timer
  redraw: () => void
  /** Resolves false when the engine left the pane waiting undrawn (too narrow to dock). */
  openPane: (pane: PaneOpenArgs) => Promise<boolean>
  closePane: (id: string) => Promise<void>
  /** Whether the pane is the one the surface shows, rather than a tab behind it. */
  isShown: (id: string) => Promise<boolean>
  /** Every pane id the surface currently shows, off one call — for a check over several ids. */
  shownPaneIds: () => Promise<ReadonlySet<string>>
  /** Moves keyboard focus to the element drawn under `key` in pane `paneId`. */
  focus: (paneId: string, key: string) => Promise<void>
  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  submitPrompt: (text: string) => Promise<void>
  /** The session's working directory, absolute; relative tool paths resolve against it. */
  cwd: () => Promise<string>
  /** Forks the main thread's last turn with `prompt`; the reply's text, or null when unanswered. */
  fork: (prompt: string) => Promise<string | null>
  /** Pins `text` as Raven's status line under the prompt; `undefined` clears it. */
  status: (text: string | undefined) => void
  /** Replaces the prompt box's draft with `text`; false when no box could take it. */
  fillPrompt: (text: string) => Promise<{ isFilled: boolean; refusal?: 'no_composer' | 'dialog' }>
  /** A transient toast over the transcript, for an error the pane has no room to show inline. */
  toast: (text: string) => void
  /** The main conversation's transcript so far. */
  messages: () => Promise<readonly SessionMessage[]>
  /** Writes `text` to the debug log only, for a failure a person never needs to see. */
  debug: (text: string) => void
  /** The parsed contents of `~/.claude.json` (settings never carries it); null when unreadable. */
  readGlobalConfig: () => Promise<unknown>
  /** Whether the session checkpoints Claude's edits, the built-in diff panel's own gate. */
  isCheckpointing: () => Promise<boolean>
}

/** A `.catch` handler that logs the failure to the debug log and answers `fallback`. */
export const loggedAs =
  <T>(host: Pick<Host, 'debug'>, what: string, fallback: T) =>
  (error: unknown): T => {
    host.debug(`raven: ${what} failed: ${String(error)}`)
    return fallback
  }

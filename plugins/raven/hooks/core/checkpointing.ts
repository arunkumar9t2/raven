import type { Settings } from 'claude-code'
import { isRecord } from './is-record'

/**
 * Whether the session checkpoints Claude's edits, read as the built-in diff panel reads it: the
 * setting on unless set false, the variable unset or falsy.
 */
export const isCheckpointing = (settings: Settings, disabling: string | undefined): boolean =>
  settings.fileCheckpointingEnabled !== false &&
  !['1', 'true', 'yes', 'on'].includes((disabling ?? '').trim().toLowerCase())

/** Whether `~/.claude.json` leaves the built-in diff sidebar open; undefined when unreadable. */
export const diffSidebarOpenOf = (globalConfig: unknown): boolean | undefined => {
  if (!isRecord(globalConfig)) return undefined
  const value = globalConfig.diffSidebarOpen
  return typeof value === 'boolean' ? value : undefined
}

/** Whether the built-in diff panel is set to cover Raven's dock: open (or unknown) and checkpointing. */
export const coversRavenDock = (globalConfig: unknown, isCheckpointingOn: boolean): boolean =>
  diffSidebarOpenOf(globalConfig) !== false && isCheckpointingOn

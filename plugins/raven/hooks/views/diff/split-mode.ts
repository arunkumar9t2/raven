import { type Host, loggedAs } from '../../core/host'
import { splitStoreKeyOf } from '../../names'

/** A layout the person forced with the header chip; null means the pane width decides. */
export type ForcedMode = 'split' | 'unified' | null

/** Below this many body columns two sides cannot hold a gutter and some text, so nothing splits. */
export const SPLIT_MIN_COLUMNS = 40

/** Whether the diff draws side by side in a body `bodyColumns` wide. */
export function splitModeOf(
  bodyColumns: number,
  splitColumns: number,
  forced: ForcedMode,
): boolean {
  if (bodyColumns < SPLIT_MIN_COLUMNS) return false
  if (forced === 'split') return true
  if (forced === 'unified') return false
  return bodyColumns >= splitColumns
}

/** A stored value as a forced mode; anything but the two words is "by width". */
export const forcedOf = (value: unknown): ForcedMode =>
  value === 'split' || value === 'unified' ? value : null

/** Owns the forced layout: read once per repository, persisted on every toggle. */
export type SplitMode = {
  /** Reads the persisted mode for `toplevel`; a no-op while the repository is unchanged. */
  resolveStored: (toplevel: string | null) => Promise<void>
  /** Whether a body `bodyColumns` wide draws side by side. */
  isSplit: (bodyColumns: number) => boolean
  /** Forces the opposite of what a body `bodyColumns` wide draws now, and persists it. */
  toggle: (bodyColumns: number) => void
}

export function createSplitMode(host: Host, splitColumns: number): SplitMode {
  let forced: ForcedMode = null
  let toplevel: string | null = null
  let readFor: string | null | undefined

  async function resolveStored(top: string | null): Promise<void> {
    if (readFor === top) return
    readFor = top
    toplevel = top
    if (top === null) return
    const stored = await host
      .storeGet(splitStoreKeyOf(top))
      .catch(loggedAs<unknown>(host, 'reading the split mode', undefined))
    forced = forcedOf(stored)
  }

  const isSplit = (bodyColumns: number) => splitModeOf(bodyColumns, splitColumns, forced)

  function toggle(bodyColumns: number): void {
    forced = isSplit(bodyColumns) ? 'unified' : 'split'
    if (toplevel === null) return
    void host
      .storeSet(splitStoreKeyOf(toplevel), forced)
      .catch(loggedAs(host, 'saving the split mode', undefined))
  }

  return { resolveStored, isSplit, toggle }
}

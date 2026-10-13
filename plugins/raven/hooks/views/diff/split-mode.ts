import { type Host, loggedAs } from '../../core/host'
import { splitStoreKeyOf } from '../../names'
import type { Chip } from '../../ui/chips'

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
  /** Whether a body `bodyColumns` wide is wide enough to split at all (else there is nothing to toggle). */
  canSplit: (bodyColumns: number) => boolean
  /** Forces the opposite of what a body `bodyColumns` wide draws now, and persists it; a no-op below the minimum. */
  toggle: (bodyColumns: number) => void
}

export function createSplitMode(host: Host, splitColumns: number): SplitMode {
  let forced: ForcedMode = null
  let toplevel: string | null = null
  let readFor: string | null | undefined
  /** Counts toggles, so a read that was in flight across one knows to drop its value. */
  let toggles = 0

  async function resolveStored(top: string | null): Promise<void> {
    if (readFor === top) return
    readFor = top
    toplevel = top
    forced = null
    if (top === null) return
    const stamp = toggles
    const stored = await host
      .storeGet(splitStoreKeyOf(top))
      .catch(loggedAs<unknown>(host, 'reading the split mode', undefined))
    // A late read loses to a toggle pressed meanwhile, and to a newer repository.
    if (readFor !== top || toggles !== stamp) return
    forced = forcedOf(stored)
  }

  const isSplit = (bodyColumns: number) => splitModeOf(bodyColumns, splitColumns, forced)

  const canSplit = (bodyColumns: number) => bodyColumns >= SPLIT_MIN_COLUMNS

  function toggle(bodyColumns: number): void {
    // Below the minimum nothing can split, so a press would only store a choice that changes
    // nothing now and surprises the person once the pane grows.
    if (!canSplit(bodyColumns)) return
    toggles += 1
    forced = isSplit(bodyColumns) ? 'unified' : 'split'
    if (toplevel === null) return
    void host
      .storeSet(splitStoreKeyOf(toplevel), forced)
      .catch(loggedAs(host, 'saving the split mode', undefined))
  }

  return { resolveStored, isSplit, canSplit, toggle }
}

/** The `chipsLayout` priority of the split chip: between refresh (1) and clear (2), so it gives way right after refresh. */
export const SPLIT_CHIP_PRIORITY = 1.5

/** The header chip that flips the layout; it names the mode a press switches to. */
export const splitChipOf = (isSplit: boolean, onPress: () => void): Chip => ({
  key: 'split',
  icon: isSplit ? '≡' : '◫',
  label: isSplit ? 'unified' : 'split',
  priority: SPLIT_CHIP_PRIORITY,
  onPress,
})

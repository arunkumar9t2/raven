import type { PluginOptions } from 'claude-code'

/** Raven's parsed `userConfig`, defaults filled in for any field a wrong type left unusable. */
export type RavenSettings = {
  /** Extra path fragments (trimmed, non-empty) whose `.md` files open in the Doc view. */
  watchedPaths: readonly string[]
  /** Lets Raven open panes nobody asked for; `shouldAutoOpen` is the one gate. */
  autoOpen: boolean
  /** Skips those opens below this terminal width, in columns. */
  autoOpenColumns: number
  /** Draws plain Tab-reachable Buttons instead of interactive pills on every surface (R42). */
  keyboardControls: boolean
}

export const DEFAULT_SETTINGS: RavenSettings = {
  watchedPaths: [],
  autoOpen: true,
  autoOpenColumns: 144,
  keyboardControls: false,
}

const watchedPathsOf = (value: unknown): readonly string[] => {
  if (typeof value !== 'string') return DEFAULT_SETTINGS.watchedPaths
  const fragments = value
    .split(',')
    .map(fragment => fragment.trim())
    .filter(fragment => fragment !== '')
  return fragments.length > 0 ? fragments : DEFAULT_SETTINGS.watchedPaths
}

const autoOpenOf = (value: unknown): boolean =>
  typeof value === 'boolean' ? value : DEFAULT_SETTINGS.autoOpen

const autoOpenColumnsOf = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_SETTINGS.autoOpenColumns

/** Parses `register`'s `options` defensively: a field of the wrong type falls back to its default. */
export function settingsOf(options: PluginOptions): RavenSettings {
  return {
    watchedPaths: watchedPathsOf(options.watchedPaths),
    autoOpen: autoOpenOf(options.autoOpen),
    autoOpenColumns: autoOpenColumnsOf(options.autoOpenColumns),
    keyboardControls:
      typeof options.keyboardControls === 'boolean'
        ? options.keyboardControls
        : DEFAULT_SETTINGS.keyboardControls,
  }
}

import type { PluginOptions } from 'claude-code'
import { type CardStyle, isCardStyle } from '../ui/style'

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
  /** How files, doc sections, the compose box and tables are framed (`ui/style.ts`). */
  cardStyle: CardStyle
  /** Pane width, in columns, at which the diff goes side-by-side unless the header chip forced a mode. */
  splitColumns: number
  /** A colour painted behind every pane so it matches the terminal; `''` leaves the engine's own. */
  paneBackground: string
}

export const DEFAULT_SETTINGS: RavenSettings = {
  watchedPaths: [],
  autoOpen: true,
  autoOpenColumns: 144,
  keyboardControls: false,
  cardStyle: 'bar',
  splitColumns: 160,
  paneBackground: '',
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

/** Trimmed like `paneBackground`: a stray space around the value in a settings file is not a typo. */
const cardStyleOf = (value: unknown): CardStyle => {
  const text = typeof value === 'string' ? value.trim() : value
  return isCardStyle(text) ? text : DEFAULT_SETTINGS.cardStyle
}

const splitColumnsOf = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_SETTINGS.splitColumns

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const RGB_COLOR = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/
const THEME_KEY = /^[A-Za-z][A-Za-z0-9_]*$/

const isColor = (text: string): boolean => {
  if (HEX_COLOR.test(text) || THEME_KEY.test(text)) return true
  const rgb = RGB_COLOR.exec(text)
  return rgb?.slice(1).every(part => Number(part) <= 255) ?? false
}

/**
 * A hex, `rgb(r, g, b)` or theme-key colour, trimmed; anything else is `''` (the engine's own).
 * Any identifier passes as a theme key on purpose: the engine's theme keys are open-ended (and
 * `COLORS` lists only the ones Raven draws with), so an unknown key like `banana` is the engine's to
 * resolve, not Raven's to second-guess.
 */
const paneBackgroundOf = (value: unknown): string => {
  if (typeof value !== 'string') return DEFAULT_SETTINGS.paneBackground
  const text = value.trim()
  return isColor(text) ? text : DEFAULT_SETTINGS.paneBackground
}

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
    cardStyle: cardStyleOf(options.cardStyle),
    splitColumns: splitColumnsOf(options.splitColumns),
    paneBackground: paneBackgroundOf(options.paneBackground),
  }
}

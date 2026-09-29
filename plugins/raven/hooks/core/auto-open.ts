import type { RavenSettings } from './settings'

/**
 * Whether the main loop's first edit of the session should auto-open the diff: `autoOpen` is on,
 * and the last width any `ui.render` reported is at least `autoOpenColumns` — or unmeasured, which
 * opens rather than staying silent by default.
 */
export function shouldAutoOpen(
  settings: RavenSettings,
  viewportColumns: number | undefined,
): boolean {
  if (!settings.autoOpen) return false
  return viewportColumns === undefined || viewportColumns >= settings.autoOpenColumns
}

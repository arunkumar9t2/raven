import type { RavenSettings } from './settings'

/**
 * Whether Raven may open a pane nobody asked for (the diff on the first edit, a plan or watched doc,
 * the first task list): `autoOpen` is on, and the last width any `ui.render` reported is at least
 * `autoOpenColumns`, or unmeasured, which opens rather than staying silent by default.
 */
export function shouldAutoOpen(
  settings: RavenSettings,
  viewportColumns: number | undefined,
): boolean {
  if (!settings.autoOpen) return false
  return viewportColumns === undefined || viewportColumns >= settings.autoOpenColumns
}

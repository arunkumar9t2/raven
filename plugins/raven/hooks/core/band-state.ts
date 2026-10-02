import type { RenderElement } from 'claude-code'
import { toplevelOf } from '../git/load'
import { PANE_IDS } from '../names'
import type { Review } from '../review/review'
import { band as renderBand } from '../views/band'
import type { Host } from './host'
import type { Kit } from './view'

export type BandStateDeps = {
  /** Brings the diff pane forward, refreshing it first. */
  openDiff: () => Promise<void>
  /** Brings the doc pane forward. */
  openDoc: () => Promise<void>
  /** Submits the pending review as a prompt; true when there was one to send. */
  sendReview: () => Promise<boolean>
}

export type BandState = {
  /**
   * The `AbovePrompt` band: null while a survey holds it, `rows` is too small, nothing is pending,
   * or a Raven pane is already visible (not just open behind another tab).
   */
  band: (kit: Kit, hasSurvey: boolean) => Promise<RenderElement | null>
  /**
   * Loads the review once without opening any pane, so a caller that needs the pending comments
   * before any pane ever loaded them (the band, or a prompt about to carry them) sees a past
   * session's. A no-op past the first call, successful or not.
   */
  ensureReviewLoaded: () => Promise<void>
  /** Records the terminal's width off any `ui.render` Raven sees, for the auto-open gate. */
  noteViewport: (columns: number | undefined) => void
  /** The last width any `ui.render` reported; `undefined` until one has. */
  viewportColumns: () => number | undefined
  /** A doc/plan was shown at `path` (undefined for a note); `isShown` says whether its pane draws. */
  noteDocShown: (path: string | undefined, isShown: boolean) => void
  /** A doc/plan at `path` was reloaded off an edit; `isShown` says whether its pane draws. */
  noteDocReloaded: (path: string, isShown: boolean) => void
  /** The doc pane was actually drawn, so the band no longer has anything unseen to flag. */
  noteDocRendered: () => void
}

/**
 * The status-band's bookkeeping: which review and doc updates nobody has seen yet, and the load/
 * open plumbing the band itself needs. `raven.ts` keeps pane orchestration and calls into `deps`
 * for the two panes the band can bring forward.
 */
export function createBandState(host: Host, review: Review, deps: BandStateDeps): BandState {
  // Set whenever a doc/plan is shown or reloaded while its pane is not on screen; cleared once the
  // doc pane is actually drawn, so the band only flags what nobody has seen yet.
  let isDocUpdated = false
  // Every path ever shown in the doc view, so a reload (fired for any edited file) only flags the
  // band for one the person actually opened here before.
  const shownDocPaths = new Set<string>()
  // The in-flight (or settled) load, memoized so a second caller awaits the same promise instead
  // of seeing a `true` guard set synchronously before the read it guards has actually finished —
  // `band` and `takePromptContext` (and the session-start kick-off in `raven.ts`) all call this.
  let loading: Promise<void> | null = null
  // The last width any `ui.render` reported; undefined until one has, which the auto-open gate
  // reads as "unknown" and opens anyway rather than staying silent by default.
  let lastViewportColumns: number | undefined

  /**
   * Loads the review once without opening any pane, so the band and status line see comments a
   * past session left pending. A failure (no repository) is not retried on every call.
   */
  function ensureReviewLoaded(): Promise<void> {
    if (loading === null) {
      loading = (async () => {
        try {
          const toplevel = await toplevelOf(host.run)
          if (toplevel !== null) await review.load(toplevel)
        } catch (error) {
          host.debug(`raven: resolving the repository for the review failed: ${String(error)}`)
        }
      })()
    }
    return loading
  }

  /**
   * Asks the engine directly rather than trusting the controller's own `open` bookkeeping: a hot
   * module reload starts that bookkeeping empty even while Raven's panes are still on screen.
   */
  async function isAnyPaneShown(): Promise<boolean> {
    const shown = await host.shownPaneIds()
    return PANE_IDS.some(id => shown.has(id))
  }

  /** The band's `open`: the diff while comments are pending, else the doc. */
  async function openFromBand(): Promise<void> {
    if (review.pending().length > 0) await deps.openDiff()
    else await deps.openDoc()
  }

  const noteDocSeenUnread = (isShown: boolean) => {
    if (isShown) return
    isDocUpdated = true
    host.redraw()
  }

  return {
    band: async (kit, hasSurvey) => {
      if (hasSurvey || kit.rows < 1) return null
      await ensureReviewLoaded()
      const pendingCount = review.pending().length
      if (pendingCount === 0 && !isDocUpdated) return null
      if (await isAnyPaneShown()) return null
      return renderBand(
        kit,
        { pendingCount, isDocUpdated },
        { open: () => void openFromBand(), send: () => void deps.sendReview() },
      )
    },
    ensureReviewLoaded,
    noteViewport: columns => {
      if (columns !== undefined) lastViewportColumns = columns
    },
    viewportColumns: () => lastViewportColumns,
    noteDocShown: (path, isShown) => {
      if (path !== undefined) shownDocPaths.add(path)
      noteDocSeenUnread(isShown)
    },
    noteDocReloaded: (path, isShown) => {
      if (shownDocPaths.has(path)) noteDocSeenUnread(isShown)
    },
    noteDocRendered: () => {
      isDocUpdated = false
    },
  }
}

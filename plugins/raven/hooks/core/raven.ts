import type { RenderElement, Timer } from 'claude-code'

import { DIFF_PANE, DOC_PANE } from '../names'
import { reviewTextOf } from '../review/comments'
import { createReview } from '../review/review'
import { createDiffView } from '../views/diff-view'
import { createDocView, type Doc } from '../views/doc-view'
import type { Directive } from './directive'
import type { Host } from './host'
import { type Action, actionsOf, type ToolEvent } from './triggers'
import type { Kit, View } from './view'

/** The engine-facing surface of Raven; `register` forwards engine events here and nothing else. */
export type Raven = {
  command: (args: string) => Promise<string>
  /** Reacts to a finished tool call; returns replacement result text for the model, if any. */
  afterTool: (event: ToolEvent) => Promise<string | undefined>
  /** Hidden context the next prompt carries: the pending review, which it consumes. */
  takePromptContext: () => string | undefined
  render: (paneId: string, kit: Kit) => RenderElement | null
  paneClosed: (paneId: string) => void
}

const REFRESH_DEBOUNCE_MS = 300

export function createRaven(host: Host, now: () => number): Raven {
  const review = createReview(host, now)
  const diff = createDiffView(host, review, () => void sendReview())
  const doc = createDocView(host)
  const views: readonly View[] = [diff, doc]

  const open = new Set<string>()
  let refreshTimer: Timer | null = null
  let hasAutoOpened = false

  /** Submits the pending review as a visible prompt, so the person sees what Claude was asked. */
  async function sendReview(): Promise<boolean> {
    const text = reviewTextOf(review.take())
    if (text !== undefined) await host.submitPrompt(text)
    return text !== undefined
  }

  async function openPane(view: View): Promise<boolean> {
    // Opening an open id only retitles it; a fresh open is what brings a background tab forward.
    if (open.has(view.pane.id) && !(await host.isShown(view.pane.id))) {
      await host.closePane(view.pane.id)
    }
    const isPlaced = await host.openPane({ ...view.pane, holdToasts: true })
    // A pane left waiting would seat itself on a later resize; withdraw it instead.
    if (!isPlaced) await host.closePane(view.pane.id)
    else open.add(view.pane.id)
    return isPlaced
  }

  async function closePane(view: View) {
    await host.closePane(view.pane.id)
    open.delete(view.pane.id)
  }

  function scheduleRefresh() {
    refreshTimer?.cancel()
    refreshTimer = host.after(REFRESH_DEBOUNCE_MS, () => {
      refreshTimer = null
      void diff.refresh()
    })
  }

  async function showDiff(path?: string) {
    await diff.refresh()
    const toplevel = diff.toplevel()
    if (path && toplevel && path.startsWith(`${toplevel}/`)) {
      diff.select(path.slice(toplevel.length + 1))
    }
    return openPane(diff)
  }

  async function showDoc(shown: Doc) {
    await doc.show(shown)
    return openPane(doc)
  }

  const shownText = (isShown: boolean, what: string) =>
    isShown
      ? `Shown in the Raven pane: ${what}.`
      : `Raven could not dock its pane (the terminal is too narrow): ${what} was not shown.`

  async function runDirective(directive: Directive): Promise<string> {
    switch (directive.op) {
      case 'show':
        return shownText(
          await showDoc({ kind: 'file', path: directive.path, title: directive.title }),
          directive.path,
        )
      case 'note':
        return shownText(
          await showDoc({ kind: 'note', markdown: directive.markdown, title: directive.title }),
          directive.title ?? 'the note',
        )
      case 'diff':
        return shownText(await showDiff(directive.path), 'the diff')
      case 'comments':
        return reviewTextOf(review.take()) ?? 'The user has no pending review comments.'
    }
  }

  async function runAction(action: Action, event: ToolEvent): Promise<string | undefined> {
    switch (action.kind) {
      case 'refresh-diff': {
        if (open.has(diff.pane.id)) scheduleRefresh()
        const isFirstMainEdit = action.isEdit && event.agentId === undefined && !hasAutoOpened
        if (isFirstMainEdit) {
          hasAutoOpened = true
          await showDiff()
        }
        return undefined
      }
      case 'show-doc':
        await showDoc({ kind: 'file', path: action.path })
        return undefined
      case 'directive':
        return runDirective(action.directive)
    }
  }

  async function command(args: string): Promise<string> {
    switch (args.trim()) {
      case '':
      case 'diff':
        if (open.has(diff.pane.id)) {
          await closePane(diff)
          return 'Raven diff hidden'
        }
        return (await showDiff()) ? 'Raven diff shown' : 'Widen the terminal to dock the Raven pane'
      case 'doc':
        if (open.has(doc.pane.id)) {
          await closePane(doc)
          return 'Raven doc hidden'
        }
        return (await openPane(doc))
          ? 'Raven doc shown'
          : 'Widen the terminal to dock the Raven pane'
      case 'send':
        return (await sendReview()) ? 'Review sent' : 'No review comments to send'
      default:
        return 'Usage: /raven [diff|doc|send]'
    }
  }

  return {
    command,
    afterTool: async event => {
      const texts: string[] = []
      for (const action of actionsOf(event)) {
        const text = await runAction(action, event)
        if (text !== undefined) texts.push(text)
      }
      if (event.isLanded && typeof event.input.file_path === 'string') {
        await doc.reload(event.input.file_path)
      }
      return texts.length > 0 ? texts.join('\n') : undefined
    },
    takePromptContext: () => reviewTextOf(review.take()),
    render: (paneId, kit) => views.find(view => view.pane.id === paneId)?.render(kit) ?? null,
    paneClosed: paneId => {
      open.delete(paneId)
    },
  }
}

export const PANE_IDS: readonly string[] = [DIFF_PANE.id, DOC_PANE.id]

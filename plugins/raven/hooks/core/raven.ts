import type { RenderElement, Timer } from 'claude-code'

import { reviewTextOf } from '../review/comments'
import { createReview } from '../review/review'
import { createDiffView } from '../views/diff-view'
import { createDocView, type Doc } from '../views/doc-view'
import { type Directive, directiveOf } from './directive'
import type { Host } from './host'
import { type Action, actionsOf, type ToolEvent } from './triggers'
import type { Kit, View } from './view'

/** The engine-facing surface of Raven; `register` forwards engine events here and nothing else. */
export type Raven = {
  /** The `/raven` argument hint: each view's subcommand, then `send`. */
  argumentHint: string
  command: (args: string) => Promise<string>
  /** Reacts to a finished tool call; returns replacement result text for the model, if any. */
  afterTool: (event: ToolEvent) => Promise<string | undefined>
  /** Runs the `show` tool's input as a directive; throws on input `directiveOf` rejects. */
  runTool: (input: unknown) => Promise<string>
  /** Hidden context the next prompt carries: the pending review, which it consumes. */
  takePromptContext: () => string | undefined
  render: (paneId: string, kit: Kit) => RenderElement | null
  /** Moves a pane's own scroll by `by` rows; true when its view handled the move. */
  scroll: (paneId: string, by: number) => boolean
  paneClosed: (paneId: string) => void
}

const REFRESH_DEBOUNCE_MS = 300
const SEND = 'send'
const NARROW_TEXT = 'Widen the terminal to dock the Raven pane'

export function createRaven(host: Host, now: () => number): Raven {
  const review = createReview(host, now)
  const diff = createDiffView(host, review, {
    send: () => void sendReview(),
    focus: key => void focusIn(diff, key),
  })
  const doc = createDocView(host)
  const views: readonly View[] = [diff, doc]

  const open = new Set<string>()
  let refreshTimer: Timer | null = null
  let hasAutoOpened = false

  const takeReviewText = () => reviewTextOf(review.take())

  function cancelRefresh() {
    refreshTimer?.cancel()
    refreshTimer = null
  }

  /** Submits the pending review as a visible prompt, so the person sees what Claude was asked. */
  async function sendReview(): Promise<boolean> {
    const text = takeReviewText()
    if (text !== undefined) await host.submitPrompt(text)
    return text !== undefined
  }

  /**
   * Shows a view's pane, bringing it forward when it is a tab behind another; false when the
   * terminal is too narrow to dock it.
   */
  async function show(view: View, focus?: true): Promise<boolean> {
    if (open.has(view.pane.id)) {
      if (!focus && (await host.isShown(view.pane.id))) return true
      // Reopening an open id only retitles it; a fresh open brings a background tab forward.
      if (!focus) await host.closePane(view.pane.id)
    }
    const isPlaced = await host.openPane({ ...view.pane, holdToasts: true, focus })
    // A pane left waiting would seat itself on a later resize; withdraw it instead.
    if (!isPlaced) await host.closePane(view.pane.id)
    else open.add(view.pane.id)
    return isPlaced
  }

  async function hide(view: View) {
    await host.closePane(view.pane.id)
    open.delete(view.pane.id)
  }

  /** The keyboard is the person's: an element can take it only once its pane asked for focus. */
  async function focusIn(view: View, key: string) {
    if (await show(view, true)) await host.focus(view.pane.id, key).catch(() => {})
  }

  function scheduleRefresh() {
    cancelRefresh()
    refreshTimer = host.after(REFRESH_DEBOUNCE_MS, () => {
      refreshTimer = null
      void diff.refresh()
    })
  }

  async function showDiff(path?: string) {
    cancelRefresh()
    await diff.refresh()
    if (path) diff.reveal(path)
    return show(diff)
  }

  async function showDoc(shown: Doc) {
    await doc.show(shown)
    return show(doc)
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
        return takeReviewText() ?? 'The user has no pending review comments.'
    }
  }

  /** A relative `path` is the tool's own, resolved against the session's cwd, not the CLI's shell. */
  async function resolveDirective(directive: Directive): Promise<Directive> {
    if (directive.op !== 'show' && directive.op !== 'diff') return directive
    const { path } = directive
    if (path === undefined || path.startsWith('/')) return directive
    return { ...directive, path: `${await host.cwd()}/${path}` }
  }

  async function runAction(action: Action): Promise<string | undefined> {
    switch (action.kind) {
      case 'refresh-diff':
        if (open.has(diff.pane.id)) scheduleRefresh()
        return undefined
      case 'main-loop-edit':
        if (!hasAutoOpened) {
          hasAutoOpened = true
          await showDiff()
        }
        return undefined
      case 'show-doc':
        await showDoc({ kind: 'file', path: action.path })
        return undefined
      case 'reload-doc':
        await doc.reload(action.path)
        return undefined
      case 'directive':
        return runDirective(action.directive)
    }
  }

  async function toggle(view: View): Promise<string> {
    const name = `Raven ${view.pane.title.toLowerCase()}`
    if (open.has(view.pane.id) && (await host.isShown(view.pane.id))) {
      await hide(view)
      return `${name} hidden`
    }
    const isShown = view === diff ? await showDiff() : await show(view)
    return isShown ? `${name} shown` : NARROW_TEXT
  }

  const argumentHint = `[${[...views.map(view => view.subcommand), SEND].join('|')}]`

  async function command(args: string): Promise<string> {
    const word = args.trim() || diff.subcommand
    const view = views.find(each => each.subcommand === word)
    if (view) return toggle(view)
    if (word === SEND) return (await sendReview()) ? 'Review sent' : 'No review comments to send'
    return `Usage: /raven ${argumentHint}`
  }

  return {
    argumentHint,
    command,
    afterTool: async event => {
      const texts: string[] = []
      for (const action of actionsOf(event)) {
        const text = await runAction(action)
        if (text !== undefined) texts.push(text)
      }
      return texts.length > 0 ? texts.join('\n') : undefined
    },
    runTool: async input => {
      const directive = directiveOf(input)
      if (!directive)
        throw new Error(`Invalid input for the Raven show tool: ${JSON.stringify(input)}`)
      return runDirective(await resolveDirective(directive))
    },
    takePromptContext: takeReviewText,
    render: (paneId, kit) => views.find(view => view.pane.id === paneId)?.render(kit) ?? null,
    scroll: (paneId, by) => views.find(view => view.pane.id === paneId)?.scroll?.(by) ?? false,
    paneClosed: paneId => {
      open.delete(paneId)
    },
  }
}

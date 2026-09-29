import type { RenderElement, Timer, TurnCompleteInput } from 'claude-code'
import { outputOf } from '../git/load'
import { DIFF_PANEL_WARNING } from '../names'
import { addressedIdsOf, reviewTextOf } from '../review/comments'
import { resolvePromptOf } from '../review/resolve'
import { createReview } from '../review/review'
import { commandOutputRow, band as renderBand } from '../views/band'
import { createDiffView } from '../views/diff-view'
import { createDocView, type Doc } from '../views/doc-view'
import { createTasksView } from '../views/tasks-view'
import { createTreeView } from '../views/tree-view'
import { coversRavenDock } from './checkpointing'
import { commandGlyphOf, NARROW_TEXT } from './command-glyph'
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
  /** Reacts to a finished main-loop turn: forks once to learn which sent comments it addressed. */
  turnCompleted: (turn: TurnCompleteInput) => Promise<void>
  render: (paneId: string, kit: Kit) => RenderElement | null
  /** Moves a pane's own scroll by `by` rows; true when its view handled the move. */
  scroll: (paneId: string, by: number) => boolean
  paneClosed: (paneId: string) => void
  /**
   * The `AbovePrompt` band: null while a survey holds it, `maxRows` is too small, nothing is
   * pending, or a Raven pane is already visible (not just open behind another tab).
   */
  band: (kit: Kit, hasSurvey: boolean) => Promise<RenderElement | null>
  /** The `/raven` command's `CommandOutput` row: its reply text behind a leading glyph. */
  commandOutput: (
    kit: Pick<Kit, 'ui'>,
    props: { text: string; isErrored: boolean },
  ) => RenderElement
}

const REFRESH_DEBOUNCE_MS = 300
const SEND = 'send'

const REFUSAL_TEXTS: Record<'no_composer' | 'dialog', string> = {
  no_composer: 'no prompt box in this session',
  dialog: 'a dialog has the keyboard',
}

export function createRaven(host: Host, now: () => number): Raven {
  const review = createReview(host, now)
  const diff = createDiffView(host, review, {
    send: () => void sendReview(),
    editAndSend: () => void editAndSend(),
    focus: key => void focusIn(diff, key),
  })
  const doc = createDocView(host)
  const tree = createTreeView(host, { open: path => void showDoc({ kind: 'file', path }) })
  const tasksView = createTasksView(host)
  const views: readonly View[] = [diff, doc, tree, tasksView]

  const open = new Set<string>()
  let refreshTimer: Timer | null = null
  let hasAutoOpened = false
  let hasOpenedTasks = false
  let hasWarnedDiffPanel = false
  // Guards the fork below from re-entering itself and caps it at one per sent batch.
  let isResolving = false
  // Set whenever a doc/plan is shown or reloaded while its pane is not on screen; cleared once
  // the doc pane is actually drawn, so the band flags only what nobody has seen yet.
  let isDocUpdated = false
  // Every path ever shown in the doc view, so a `reload-doc` (fired for any edited file) only
  // flags the band for one the person actually opened here before.
  const shownDocPaths = new Set<string>()
  let hasLoadedReview = false

  /**
   * Once per module instance: warns when the built-in diff panel will cover Raven's dock. Never
   * throws, so a failed check never blocks the command or edit that triggered it.
   */
  async function warnDiffPanelOnce(): Promise<void> {
    if (hasWarnedDiffPanel) return
    hasWarnedDiffPanel = true
    try {
      const [globalConfig, checkpointing] = await Promise.all([
        host.readGlobalConfig(),
        host.isCheckpointing(),
      ])
      if (coversRavenDock(globalConfig, checkpointing)) host.toast(DIFF_PANEL_WARNING)
    } catch (error) {
      host.debug(`raven: diff panel check failed: ${String(error)}`)
    }
  }

  const takeReviewText = () => reviewTextOf(review.take())

  /** Forks once to ask which sent comments the finished turn addressed, then marks them. */
  async function resolveSent(): Promise<void> {
    const sent = review.sent()
    if (sent.length === 0 || isResolving) return
    isResolving = true
    try {
      const reply = await host.fork(resolvePromptOf(sent))
      // No bracketed array in the reply means it was unparseable, not "nothing addressed"; leave
      // the comments sent rather than bouncing every one of them to 'open'.
      if (reply !== null && /\[[\s\S]*\]/.test(reply)) {
        review.markAddressed(
          addressedIdsOf(
            reply,
            sent.map(comment => comment.id),
          ),
        )
        host.redraw()
      }
    } finally {
      isResolving = false
    }
  }

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

  const refusalTextOf = (refusal: 'no_composer' | 'dialog' | undefined) =>
    (refusal && REFUSAL_TEXTS[refusal]) ?? 'the fill was refused'

  /** Fills the prompt box with the pending review so the person can edit it before sending. */
  async function editAndSend(): Promise<void> {
    if (review.pending().length === 0) return
    const taken = review.take()
    const text = reviewTextOf(taken)
    if (text === undefined) return
    const filled = await host.fillPrompt(text)
    if (!filled.isFilled) {
      review.restore(taken.map(comment => comment.id))
      host.toast(`Raven: could not fill the prompt (${refusalTextOf(filled.refusal)})`)
    }
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
    // Marked before the open: the engine draws the pane while `openPane` is in flight.
    open.add(view.pane.id)
    const isPlaced = await host.openPane({ ...view.pane, holdToasts: true, focus })
    // A pane left waiting would seat itself on a later resize; withdraw it instead.
    if (!isPlaced) await host.closePane(view.pane.id)
    return isPlaced
  }

  async function hide(view: View) {
    await host.closePane(view.pane.id)
    open.delete(view.pane.id)
    host.redraw()
  }

  /**
   * Loads the review once without opening any pane, so the band and status line see comments a
   * past session left pending. A failure (no repository) is not retried on every call.
   */
  async function ensureReviewLoaded(): Promise<void> {
    if (hasLoadedReview) return
    hasLoadedReview = true
    try {
      const toplevel = outputOf(await host.run(['git', 'rev-parse', '--show-toplevel']))
      if (toplevel !== null) await review.load(toplevel)
    } catch (error) {
      host.debug(`raven: resolving the repository for the review failed: ${String(error)}`)
    }
  }

  /** The keyboard is the person's: an element can take it only once its pane asked for focus. */
  async function focusIn(view: View, key: string) {
    if (await show(view, true)) {
      await host
        .focus(view.pane.id, key)
        .catch(error => host.debug(`raven: focus failed: ${String(error)}`))
    }
  }

  function scheduleRefresh() {
    cancelRefresh()
    refreshTimer = host.after(REFRESH_DEBOUNCE_MS, () => {
      refreshTimer = null
      if (open.has(diff.pane.id)) void diff.refresh()
      if (open.has(tree.pane.id)) void tree.refresh()
    })
  }

  async function showDiff(path?: string) {
    cancelRefresh()
    await diff.refresh()
    if (open.has(tree.pane.id)) void tree.refresh()
    if (path) diff.reveal(path)
    return show(diff)
  }

  async function showDoc(shown: Doc) {
    await doc.show(shown)
    if (shown.kind === 'file') shownDocPaths.add(shown.path)
    if (!(await host.isShown(doc.pane.id))) {
      isDocUpdated = true
      host.redraw()
    }
    return show(doc)
  }

  async function showTree() {
    await tree.refresh({ force: true })
    return show(tree)
  }

  /** True while some Raven pane is the one the surface shows, not just a tab behind another. */
  async function isAnyPaneShown(): Promise<boolean> {
    for (const id of open) {
      if (await host.isShown(id)) return true
    }
    return false
  }

  /** The band's `open`: the diff while comments are pending, else the doc. */
  async function openFromBand(): Promise<void> {
    if (review.pending().length > 0) await showDiff()
    else await show(doc)
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
        if (open.has(diff.pane.id) || open.has(tree.pane.id)) scheduleRefresh()
        return undefined
      case 'main-loop-edit':
        void warnDiffPanelOnce()
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
        if (shownDocPaths.has(action.path) && !(await host.isShown(doc.pane.id))) {
          isDocUpdated = true
          host.redraw()
        }
        return undefined
      case 'directive':
        return runDirective(action.directive)
      case 'tasks': {
        const changed = tasksView.apply(action.tool, action.input, action.result)
        if (changed && !hasOpenedTasks && tasksView.hasTasks()) {
          hasOpenedTasks = true
          if (open.size === 0) await show(tasksView)
        }
        return undefined
      }
    }
  }

  async function toggle(view: View): Promise<string> {
    const name = `Raven ${view.pane.title.toLowerCase()}`
    if (open.has(view.pane.id) && (await host.isShown(view.pane.id))) {
      await hide(view)
      return `${name} hidden`
    }
    const isShown =
      view === diff ? await showDiff() : view === tree ? await showTree() : await show(view)
    return isShown ? `${name} shown` : NARROW_TEXT
  }

  const argumentHint = `[${[...views.map(view => view.subcommand), SEND].join('|')}]`

  async function command(args: string): Promise<string> {
    await warnDiffPanelOnce()
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
    turnCompleted: () => resolveSent(),
    render: (paneId, kit) => {
      const view = views.find(each => each.pane.id === paneId)
      if (!view) return null
      // A reloaded module inherits open panes it never opened: drawing one proves it is open, and
      // its model starts empty until a refresh.
      if (!open.has(paneId)) {
        open.add(paneId)
        void view.refresh?.().catch(error => host.debug(`raven: refresh failed: ${String(error)}`))
      }
      if (view === doc) isDocUpdated = false
      return view.render(kit)
    },
    scroll: (paneId, by) => views.find(view => view.pane.id === paneId)?.scroll?.(by) ?? false,
    paneClosed: paneId => {
      open.delete(paneId)
      host.redraw()
    },
    band: async (kit, hasSurvey) => {
      if (hasSurvey || kit.rows < 1) return null
      await ensureReviewLoaded()
      const pendingCount = review.pending().length
      if (pendingCount === 0 && !isDocUpdated) return null
      if (await isAnyPaneShown()) return null
      return renderBand(
        kit,
        { pendingCount, isDocUpdated },
        { open: () => void openFromBand(), send: () => void sendReview() },
      )
    },
    commandOutput: (kit, props) =>
      commandOutputRow(kit, { ...props, glyph: commandGlyphOf(props.text, props.isErrored) }),
  }
}

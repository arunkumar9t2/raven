import type { RenderElement, Timer, TurnCompleteInput } from 'claude-code'
import { DIFF_PANEL_WARNING } from '../names'
import { addressedIdsOf, reviewTextOf } from '../review/comments'
import { resolvePromptOf } from '../review/resolve'
import { createReview } from '../review/review'
import { createDiffView } from '../views/diff-view'
import { createDocView, type Doc } from '../views/doc-view'
import { createTasksView } from '../views/tasks-view'
import { createTreeView } from '../views/tree-view'
import { shouldAutoOpen } from './auto-open'
import { createBandState } from './band-state'
import { coversRavenDock } from './checkpointing'
import { type CommandKind, type CommandResult, NARROW_TEXT } from './command-glyph'
import { type Directive, directiveOf } from './directive'
import type { Host } from './host'
import type { RavenSettings } from './settings'
import {
  type Action,
  actionsOf,
  type PlanNote,
  planActionsOf,
  type ToolEvent,
  triggersOf,
} from './triggers'
import type { Kit, View } from './view'

/** The engine-facing surface of Raven; `register` forwards engine events here and nothing else. */
export type Raven = {
  /** The `/raven` argument hint: each view's subcommand, then `send`. */
  argumentHint: string
  command: (args: string) => Promise<CommandResult>
  /**
   * Reacts to a finished tool call; returns replacement result text for the model, if any. Never
   * rejects: a failure goes to the debug log.
   */
  afterTool: (event: ToolEvent) => Promise<string | undefined>
  /**
   * Learns the plan file plan mode named, so its edits render live; opens it on exit/re-entry.
   * Never rejects: a failure goes to the debug log.
   */
  planNoted: (note: PlanNote) => Promise<void>
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
  /** Records the terminal's width off any `ui.render` Raven sees, for the auto-open gate. */
  noteViewport: (columns: number | undefined) => void
  /**
   * The `AbovePrompt` band: null while a survey holds it, `maxRows` is too small, nothing is
   * pending, or a Raven pane is already visible (not just open behind another tab).
   */
  band: (kit: Kit, hasSurvey: boolean) => Promise<RenderElement | null>
  /** The kind a past `command()` call resolved `text` to; `'info'` when no call produced it. */
  resultKindOf: (text: string) => CommandKind
}

const REFRESH_DEBOUNCE_MS = 300
const SEND = 'send'

const REFUSAL_TEXTS: Record<'no_composer' | 'dialog', string> = {
  no_composer: 'no prompt box in this session',
  dialog: 'a dialog has the keyboard',
}

export function createRaven(host: Host, settings: RavenSettings, now: () => number): Raven {
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
  const planPaths = new Set<string>()
  const triggers = triggersOf(settings)
  // The kind the most recent `command()` call resolved each reply text to, for a `CommandOutput`
  // row the engine asks Raven to redraw without re-running the command.
  const resultKindByText = new Map<string, CommandKind>()

  const bandState = createBandState(host, review, {
    openDiff: async () => {
      await showDiff()
    },
    openDoc: async () => {
      await show(doc)
    },
    sendReview,
  })

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
    // Captured before the fork: a newer batch sent while this fork is in flight must not be
    // touched by the reply this one gets back.
    const batchIds = sent.map(comment => comment.id)
    try {
      const reply = await host.fork(resolvePromptOf(sent))
      // No bracketed array in the reply means it was unparseable, not "nothing addressed"; leave
      // the comments sent rather than bouncing every one of them to 'open'.
      if (reply !== null && /\[[\s\S]*\]/.test(reply)) {
        review.resolveBatch(batchIds, addressedIdsOf(reply, batchIds))
        host.redraw()
      }
    } catch (error) {
      host.debug(`raven: resolving sent comments failed: ${String(error)}`)
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
  const isPaneShown = async (id: string) => (await host.shownPaneIds()).has(id)

  async function show(view: View, focus?: true): Promise<boolean> {
    if (open.has(view.pane.id)) {
      if (!focus && (await isPaneShown(view.pane.id))) return true
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
    bandState.noteDocShown(
      shown.kind === 'file' ? shown.path : undefined,
      await isPaneShown(doc.pane.id),
    )
    return show(doc)
  }

  async function showTree() {
    await tree.refresh({ force: true })
    return show(tree)
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
          if (shouldAutoOpen(settings, bandState.viewportColumns())) await showDiff()
        }
        return undefined
      case 'show-doc':
        await showDoc({ kind: 'file', path: action.path })
        return undefined
      case 'reload-doc':
        await doc.reload(action.path)
        bandState.noteDocReloaded(action.path, await isPaneShown(doc.pane.id))
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

  /** Records `kind` against `text` for a later `resultKindOf`, and returns the pair as-is. */
  const resultOf = (kind: CommandKind, text: string): CommandResult => {
    resultKindByText.set(text, kind)
    return { kind, text }
  }

  async function toggle(view: View): Promise<CommandResult> {
    const name = `Raven ${view.pane.title.toLowerCase()}`
    if (open.has(view.pane.id) && (await isPaneShown(view.pane.id))) {
      await hide(view)
      return resultOf('hidden', `${name} hidden`)
    }
    const isShown =
      view === diff ? await showDiff() : view === tree ? await showTree() : await show(view)
    return isShown ? resultOf('shown', `${name} shown`) : resultOf('narrow', NARROW_TEXT)
  }

  const argumentHint = `[${[...views.map(view => view.subcommand), SEND].join('|')}]`

  /** Never rejects: a thrown failure becomes an `'error'` result like usage help does. */
  async function command(args: string): Promise<CommandResult> {
    try {
      await warnDiffPanelOnce()
      const word = args.trim() || diff.subcommand
      const view = views.find(each => each.subcommand === word)
      if (view) return toggle(view)
      if (word === SEND) {
        return (await sendReview())
          ? resultOf('shown', 'Review sent')
          : resultOf('hidden', 'No review comments to send')
      }
      return resultOf('error', `Usage: /raven ${argumentHint}`)
    } catch (error) {
      return resultOf('error', `Raven failed: ${String(error)}`)
    }
  }

  return {
    argumentHint,
    command,
    afterTool: async event => {
      try {
        const texts: string[] = []
        for (const action of actionsOf(event, triggers, planPaths)) {
          const text = await runAction(action)
          if (text !== undefined) texts.push(text)
        }
        return texts.length > 0 ? texts.join('\n') : undefined
      } catch (error) {
        host.debug(`raven: afterTool failed: ${String(error)}`)
        return undefined
      }
    },
    planNoted: async note => {
      planPaths.add(note.planFilePath)
      try {
        for (const action of planActionsOf(note)) await runAction(action)
      } catch (error) {
        host.debug(`raven: planNoted failed: ${String(error)}`)
      }
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
      if (view === doc) bandState.noteDocRendered()
      return view.render(kit)
    },
    scroll: (paneId, by) => views.find(view => view.pane.id === paneId)?.scroll?.(by) ?? false,
    paneClosed: paneId => {
      open.delete(paneId)
      host.redraw()
    },
    noteViewport: columns => bandState.noteViewport(columns),
    band: (kit, hasSurvey) => bandState.band(kit, hasSurvey),
    resultKindOf: text => resultKindByText.get(text) ?? 'info',
  }
}

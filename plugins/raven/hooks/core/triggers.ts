import { TASK_TOOLS } from '../review/tasks'
import { type Directive, directivesIn } from './directive'
import type { RavenSettings } from './settings'

/** A finished tool call, as the triggers read it. */
export type ToolEvent = {
  tool: string
  input: Readonly<Record<string, unknown>>
  /** The call ran and was neither refused nor an error. */
  isLanded: boolean
  /** Set when a subagent made the call. */
  agentId?: string
  stdout?: string
  /** The tool result's structured `result`, when the call landed. */
  result?: unknown
}

export type Action =
  | { kind: 'refresh-diff' }
  /** The main loop's edit landed: the controller opens the diff on the first of these. */
  | { kind: 'main-loop-edit' }
  | { kind: 'show-doc'; path: string }
  | { kind: 'reload-doc'; path: string }
  | { kind: 'directive'; directive: Directive }
  | { kind: 'tasks'; tool: string; input: Readonly<Record<string, unknown>>; result?: unknown }

export type Trigger = (event: ToolEvent) => readonly Action[]

const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']
const SHELL_TOOLS = ['Bash', 'PowerShell']

/** Markdown written under these paths opens in the doc view as it is written. */
const WATCHED_DOC_PATTERNS = [
  /\/docs\/superpowers\/(plans|specs)\/[^/]+\.md$/,
  /\/\.superpowers\/.+\.md$/,
  /\/\.claude\/plans\/[^/]+\.md$/,
]

/** `fragment` split into its non-empty `/`-separated segments. */
const segmentsOf = (value: string) => value.split('/').filter(segment => segment !== '')

/**
 * True when `fragment`'s segments occur contiguously among `path`'s, so a single-segment fragment
 * like `docs` never matches a longer segment like `docsystem`, while a multi-segment fragment like
 * `notes/drafts` still matches across the two segments it names.
 */
const containsFragment = (path: string, fragment: string): boolean => {
  const needle = segmentsOf(fragment)
  if (needle.length === 0) return false
  const haystack = path.split('/')
  for (let start = 0; start + needle.length <= haystack.length; start++) {
    if (needle.every((segment, i) => haystack[start + i] === segment)) return true
  }
  return false
}

const isWatchedDocPath = (path: string, watchedPaths: readonly string[]) =>
  path.endsWith('.md') &&
  (WATCHED_DOC_PATTERNS.some(pattern => pattern.test(path)) ||
    watchedPaths.some(fragment => containsFragment(path, fragment)))

/** The file a landed edit wrote, or null for any other call. */
const editedPathOf = (event: ToolEvent) => {
  if (!event.isLanded || !EDIT_TOOLS.includes(event.tool)) return null
  const path = event.input.file_path ?? event.input.notebook_path
  return typeof path === 'string' ? path : null
}

const onEdit: Trigger = event => {
  const path = editedPathOf(event)
  if (path === null) return []
  const actions: Action[] = [{ kind: 'refresh-diff' }, { kind: 'reload-doc', path }]
  if (event.agentId === undefined) actions.push({ kind: 'main-loop-edit' })
  return actions
}

// A failed or interrupted command may still have written files, so any shell call refreshes.
const onShell: Trigger = event =>
  SHELL_TOOLS.includes(event.tool) ? [{ kind: 'refresh-diff' }] : []

const onWatchedDocOf =
  (watchedPaths: readonly string[]): Trigger =>
  event => {
    const path = editedPathOf(event)
    return path !== null && isWatchedDocPath(path, watchedPaths) ? [{ kind: 'show-doc', path }] : []
  }

const onDirective: Trigger = event =>
  SHELL_TOOLS.includes(event.tool) && event.stdout
    ? directivesIn(event.stdout).map(directive => ({ kind: 'directive', directive }))
    : []

const onTasks: Trigger = event =>
  event.isLanded && TASK_TOOLS.includes(event.tool)
    ? [{ kind: 'tasks', tool: event.tool, input: event.input, result: event.result }]
    : []

/** Every trigger, built once per session from its settings; only `onWatchedDoc` reads them. */
export const triggersOf = (settings: RavenSettings): readonly Trigger[] => [
  onEdit,
  onShell,
  onWatchedDocOf(settings.watchedPaths),
  onDirective,
  onTasks,
]

export const actionsOf = (event: ToolEvent, triggers: readonly Trigger[]) =>
  triggers.flatMap(trigger => trigger(event))

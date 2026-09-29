import { type Directive, directivesIn } from './directive'

/** A finished tool call, as the triggers read it. */
export type ToolEvent = {
  tool: string
  input: Readonly<Record<string, unknown>>
  /** The call ran and was neither refused nor an error. */
  isLanded: boolean
  /** Set when a subagent made the call. */
  agentId?: string
  stdout?: string
}

export type Action =
  | { kind: 'refresh-diff' }
  /** The main loop's edit landed: the controller opens the diff on the first of these. */
  | { kind: 'main-loop-edit' }
  | { kind: 'show-doc'; path: string }
  | { kind: 'reload-doc'; path: string }
  | { kind: 'directive'; directive: Directive }

export type Trigger = (event: ToolEvent) => readonly Action[]

const EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit', 'MultiEdit']
const SHELL_TOOLS = ['Bash', 'PowerShell']

/** Markdown written under these paths opens in the doc view as it is written. */
const WATCHED_DOC_PATHS = [
  /\/docs\/superpowers\/(plans|specs)\/[^/]+\.md$/,
  /\/\.superpowers\/.+\.md$/,
  /\/\.claude\/plans\/[^/]+\.md$/,
]

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

const onWatchedDoc: Trigger = event => {
  const path = editedPathOf(event)
  return path !== null && WATCHED_DOC_PATHS.some(pattern => pattern.test(path))
    ? [{ kind: 'show-doc', path }]
    : []
}

const onDirective: Trigger = event =>
  SHELL_TOOLS.includes(event.tool) && event.stdout
    ? directivesIn(event.stdout).map(directive => ({ kind: 'directive', directive }))
    : []

/** Every trigger, in the order their actions run. Adding a reaction is one entry here. */
export const TRIGGERS: readonly Trigger[] = [onEdit, onShell, onWatchedDoc, onDirective]

export const actionsOf = (event: ToolEvent, triggers = TRIGGERS) =>
  triggers.flatMap(trigger => trigger(event))

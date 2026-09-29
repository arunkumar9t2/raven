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
  | { kind: 'refresh-diff'; isEdit: boolean }
  | { kind: 'show-doc'; path: string }
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

const editedPathOf = (event: ToolEvent) => {
  const path = event.input.file_path ?? event.input.notebook_path
  return typeof path === 'string' ? path : null
}

const onEdit: Trigger = event =>
  EDIT_TOOLS.includes(event.tool) && event.isLanded ? [{ kind: 'refresh-diff', isEdit: true }] : []

// A failed or interrupted command may still have written files, so any shell call refreshes.
const onShell: Trigger = event =>
  SHELL_TOOLS.includes(event.tool) ? [{ kind: 'refresh-diff', isEdit: false }] : []

const onWatchedDoc: Trigger = event => {
  const path = editedPathOf(event)
  const isWatched = path !== null && WATCHED_DOC_PATHS.some(pattern => pattern.test(path))
  return event.isLanded && isWatched && EDIT_TOOLS.includes(event.tool)
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

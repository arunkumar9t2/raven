/**
 * Every name derived from the product's working title, so a rename is one edit here; the CLI
 * imports these at build time.
 */
export const NAME = 'raven'

export const COMMAND = NAME
export const COMMAND_DESCRIPTION = 'Toggle the Raven preview pane (diff, docs, review)'

export const DIFF_PANE = { id: NAME, title: 'Diff' } as const
export const DOC_PANE = { id: `${NAME}-doc`, title: 'Doc' } as const
export const PANE_IDS: readonly string[] = [DIFF_PANE.id, DOC_PANE.id]

/** The short name `$.tool.register` takes; the model calls it as `mcp__<plugin>__show`. */
export const TOOL_NAME = 'show'

/**
 * The tool's full name, as the model sees it. A plugin loaded from a directory may carry a name
 * other than `raven`, so this reads `$.plugin.name` at runtime rather than assuming one.
 */
export const toolNameOf = (pluginName: string) => `mcp__${pluginName}__${TOOL_NAME}`

/** The start of the line the CLI prints after a directive, for a reader with no mod to consume it. */
export const FALLBACK_PREFIX = 'Raven pane is not active;'

/** The prefix of a directive line the CLI prints; the JSON payload follows it. */
export const DIRECTIVE_PREFIX = `::${NAME}::`

/** The store key of one repository's pending review comments. */
export const commentsStoreKeyOf = (repository: string) => `comments:${repository}`

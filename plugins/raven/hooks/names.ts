/**
 * Every name derived from the product's working title, so a rename is one edit here and one in
 * `cli/src/names.ts`.
 */
export const NAME = 'raven'

export const COMMAND = NAME
export const COMMAND_DESCRIPTION = 'Toggle the Raven preview pane (diff, docs, review)'

export const DIFF_PANE = { id: NAME, title: 'Diff' } as const
export const DOC_PANE = { id: `${NAME}-doc`, title: 'Doc' } as const

/** The prefix of a directive line the CLI prints; the JSON payload follows it. */
export const DIRECTIVE_PREFIX = `::${NAME}::`

export const storeKeyOf = (kind: 'comments', scope: string) => `${kind}:${scope}`

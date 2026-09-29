import { DIRECTIVE_PREFIX } from './names'

/** What the CLI asks of the pane; see docs/spec.md "Directive contract". */
export type Directive =
  | { op: 'show'; path: string; title?: string }
  | { op: 'note'; markdown: string; title?: string }
  | { op: 'diff'; path?: string }
  | { op: 'comments' }

/** The one directive line the CLI prints; the mod reads it from the Bash tool's result. */
export function directiveLine(directive: Directive): string {
  return `${DIRECTIVE_PREFIX}${JSON.stringify(directive)}`
}

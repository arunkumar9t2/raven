import { DIRECTIVE_PREFIX, FALLBACK_PREFIX } from '../names'
import { isRecord } from './is-record'

export const DIRECTIVE_OPS = ['show', 'note', 'diff', 'comments'] as const
type DirectiveOp = (typeof DIRECTIVE_OPS)[number]

/** What the CLI asks of the pane; see docs/spec.md "Directive contract". */
export type Directive =
  | { op: 'show'; path: string; title?: string }
  | { op: 'note'; markdown: string; title?: string }
  | { op: 'diff'; path?: string }
  | { op: 'comments' }

const optionalString = (value: unknown) => value === undefined || typeof value === 'string'

/** Parses one directive's payload (a CLI's printed JSON, or the `show` tool's input) or null. */
export function directiveOf(value: unknown): Directive | null {
  if (!isRecord(value)) return null
  const { op, path, title, markdown } = value
  if (!optionalString(title) || !optionalString(path)) return null
  if (!DIRECTIVE_OPS.includes(op as DirectiveOp)) return null

  switch (op as DirectiveOp) {
    case 'show':
      return typeof path === 'string' ? (value as Directive) : null
    case 'note':
      return typeof markdown === 'string' ? (value as Directive) : null
    case 'diff':
    case 'comments':
      return value as Directive
  }
}

/** The directives in a command's stdout, in order; malformed and unknown lines are skipped. */
export function directivesIn(stdout: string): Directive[] {
  return stdout.split('\n').flatMap(line => {
    if (!line.startsWith(DIRECTIVE_PREFIX)) return []
    try {
      const directive = directiveOf(JSON.parse(line.slice(DIRECTIVE_PREFIX.length)))
      return directive ? [directive] : []
    } catch {
      return []
    }
  })
}

/** A command's output with the CLI's directive and fallback lines removed, keeping everything else. */
export const withoutDirectives = (output: string) =>
  output
    .split('\n')
    .filter(line => !line.startsWith(DIRECTIVE_PREFIX) && !line.startsWith(FALLBACK_PREFIX))
    .join('\n')
    .trim()

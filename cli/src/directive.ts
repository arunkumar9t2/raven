import type { Directive } from '../../plugins/raven/hooks/core/directive'
import { DIRECTIVE_PREFIX } from './names'

/** The one directive line the CLI prints; the mod reads it from the Bash tool's result. */
export function directiveLine(directive: Directive): string {
  return `${DIRECTIVE_PREFIX}${JSON.stringify(directive)}`
}

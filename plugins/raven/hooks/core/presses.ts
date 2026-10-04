/**
 * The press registry: what a `Client` pill's `{ press: id }` post runs. Every render of a pane
 * (`begin`) clears that pane's entries and registers the handlers of the pills it draws (`add`), so
 * an id a later render no longer draws goes dead. Keyed by the drawing's `requestId`, the one
 * address a `ui.message` carries back.
 */
export type Presses = {
  /** Starts a render of `scope`: forgets every handler its last render registered. */
  begin: (scope: string) => void
  add: (scope: string, id: string, onPress: () => void) => void
  /** Runs the handler `id` has in `scope`; false when there is none (a stale or unknown id). */
  dispatch: (scope: string, id: string) => boolean
}

export function createPresses(): Presses {
  const byScope = new Map<string, Map<string, () => void>>()
  return {
    begin: scope => {
      byScope.set(scope, new Map())
    },
    add: (scope, id, onPress) => {
      let handlers = byScope.get(scope)
      if (!handlers) {
        handlers = new Map()
        byScope.set(scope, handlers)
      }
      handlers.set(id, onPress)
    },
    dispatch: (scope, id) => {
      const handler = byScope.get(scope)?.get(id)
      if (!handler) return false
      handler()
      return true
    },
  }
}

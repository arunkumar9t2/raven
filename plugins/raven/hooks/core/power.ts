/** The panes `/raven off` closed, for `/raven on` to reopen; `front` was the visible one. */
export type Snapshot = { ids: readonly string[]; front?: string }

/**
 * Whether the person turned Raven off this session. The invariant: while off, no Raven pane is
 * open. `/raven off` enters it, closing every pane and remembering them; any pane actually placed
 * afterwards (the person's, Claude's or `/raven on`'s) leaves it and drops what was remembered.
 */
export type Power = {
  isOff: () => boolean
  turnOff: (snapshot: Snapshot) => void
  /** What `/raven off` remembered; null while on. */
  snapshot: () => Snapshot | null
  /** A pane was placed: Raven is on again. */
  noteOpened: () => void
}

export function createPower(): Power {
  let off: Snapshot | null = null
  return {
    isOff: () => off !== null,
    turnOff: snapshot => {
      off = snapshot
    },
    snapshot: () => off,
    noteOpened: () => {
      off = null
    },
  }
}

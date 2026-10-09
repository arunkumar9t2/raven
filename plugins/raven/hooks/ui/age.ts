const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * `createdAt`'s age against `now`, as a note's margin reads it: `now` under a minute, else
 * `Nm`/`Nh`/`Nd`: minutes, hours or days, whichever is the largest whole unit that fits. Pure so
 * a view never calls `Date.now()` itself; it takes `now` from its own clock instead.
 */
export function ageOf(createdAt: number, now: number): string {
  const elapsed = Math.max(0, now - createdAt)
  if (elapsed < MINUTE_MS) return 'now'
  if (elapsed < HOUR_MS) return `${Math.floor(elapsed / MINUTE_MS)}m`
  if (elapsed < DAY_MS) return `${Math.floor(elapsed / HOUR_MS)}h`
  return `${Math.floor(elapsed / DAY_MS)}d`
}

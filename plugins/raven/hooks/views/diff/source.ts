import type { SelectOption } from 'claude-code'
import type { Hunk } from '../../git/hunks'
import type { TurnEdits } from '../../review/turns'

/** What the diff is shown against: `HEAD`, the session's start, the branch point, or one turn. */
export type Source =
  | { kind: 'head' }
  | { kind: 'session' }
  | { kind: 'branch-point' }
  | { kind: 'turn'; index: number }

const HEAD_VALUE = 'head'
const SESSION_VALUE = 'session'
const BRANCH_POINT_VALUE = 'branch-point'
const TURN_PREFIX = 'turn:'

/** The Select value of a turn source. */
export const turnValueOf = (index: number) => `${TURN_PREFIX}${index}`

/** Only `head`/`session`/`branch-point` persist; a turn selection never does. */
export const isPersistable = (source: Source): source is Exclude<Source, { kind: 'turn' }> =>
  source.kind !== 'turn'

/** The Select value of a source, matching `sourceOf`. */
export function sourceValueOf(source: Source): string {
  switch (source.kind) {
    case 'head':
      return HEAD_VALUE
    case 'session':
      return SESSION_VALUE
    case 'branch-point':
      return BRANCH_POINT_VALUE
    case 'turn':
      return turnValueOf(source.index)
  }
}

/** Parses a Select value into a Source; anything unrecognized falls back to `head`. */
export function sourceOf(value: string): Source {
  if (value === SESSION_VALUE) return { kind: 'session' }
  if (value === BRANCH_POINT_VALUE) return { kind: 'branch-point' }
  if (value.startsWith(TURN_PREFIX)) {
    const index = Number(value.slice(TURN_PREFIX.length))
    if (Number.isInteger(index)) return { kind: 'turn', index }
  }
  return { kind: 'head' }
}

/**
 * The selected file's hunks. A turn source's come only from the controller's own `turnHunks`: a
 * turn file with none (still loading, or genuinely none) must show that, not `modelHunks` — stale
 * working-tree data the diff view loaded for an unrelated source, which happens to share the same
 * path.
 */
export function selectedHunksOf(
  source: Source,
  turnHunks: readonly Hunk[] | undefined,
  modelHunks: readonly Hunk[] | undefined,
): readonly Hunk[] | undefined {
  return source.kind === 'turn' ? turnHunks : modelHunks
}

export type SourceOptionsArgs = {
  /** Whether `branchPointOf` resolved a sha; hides the option otherwise. */
  hasBranchPoint: boolean
  turns: readonly TurnEdits[]
}

/**
 * The source Select's options: `HEAD`, session start, branch point (when resolvable), then each
 * turn newest first.
 */
export function sourceOptionsOf(args: SourceOptionsArgs): SelectOption[] {
  const options: SelectOption[] = [
    { value: HEAD_VALUE, label: 'HEAD' },
    { value: SESSION_VALUE, label: 'session start' },
  ]
  if (args.hasBranchPoint) options.push({ value: BRANCH_POINT_VALUE, label: 'branch point' })
  for (const turn of [...args.turns].reverse()) {
    options.push({ value: turnValueOf(turn.index), label: `turn ${turn.index} — ${turn.prompt}` })
  }
  return options
}

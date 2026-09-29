import type { SelectOption, SessionMessage } from 'claude-code'
import { type Host, loggedAs } from '../../core/host'
import { branchPointOf } from '../../git/base'
import type { ChangedFile } from '../../git/changes'
import type { Hunk } from '../../git/hunks'
import type { Base } from '../../git/load'
import { sourceStoreKeyOf } from '../../names'
import { changedFileOfTurnFile, type TurnEdits, turnEditsOf, turnFilesOf } from '../../review/turns'
import { isPersistable, type Source, sourceOf, sourceOptionsOf } from './source'

type Repository = { toplevel: string; files: readonly ChangedFile[] } | null

/** One turn's files and hunks, built once per `(turns, index)` so callers get stable references. */
type TurnView = {
  turns: readonly TurnEdits[]
  index: number
  files: ChangedFile[]
  hunksByPath: Map<string, Hunk[]>
}

/** Owns what the diff is shown against: the source, its resolved base, and the turns it lists. */
export type SourceController = {
  /** Reads the persisted source for the repository at `host.cwd()`; a no-op past the first call. */
  resolveStoredSource: () => Promise<void>
  /** Rereads the branch point and turns; call after `loadChanges` resolves. */
  refresh: (repository: Repository) => Promise<void>
  /** The current source. */
  source: () => Source
  /** The git revision the current source diffs against. */
  base: () => Base
  /** The files the current source shows: the repository's, or one turn's, stable across calls. */
  files: (repository: Repository) => readonly ChangedFile[]
  /** A turn source's hunks for `file`; `undefined` for a non-turn source (the caller loads those). */
  hunksFor: (file: ChangedFile) => readonly Hunk[] | undefined
  /** The source Select's options, reused while the branch point and turns haven't changed. */
  options: () => SelectOption[]
  /** Switches the source, persisting it when it's a persistable kind. */
  select: (value: string) => void
  /** A turn source is read-only: no comments, no stage/revert. */
  isReadOnly: () => boolean
}

export function createSourceController(host: Host): SourceController {
  let source: Source = { kind: 'head' }
  let sessionStartSha: string | null = null
  let branchPointSha: string | null = null
  let turns: readonly TurnEdits[] = []
  let toplevel: string | null = null

  let hasReadStoredSource = false

  // Bumped by each refresh, so a slow call that lands after a newer one is dropped.
  let generation = 0

  // The branch point is recomputed only when the (toplevel, HEAD sha) pair it was last resolved
  // for has changed; `git rev-parse HEAD` alone is the one cheap call paid every refresh.
  let lastBranchPointToplevel: string | null = null
  let lastBranchPointHeadSha: string | null = null

  let lastMessagesLength = -1
  let lastMessage: SessionMessage | undefined

  let optionsCache: {
    hasBranchPoint: boolean
    turns: readonly TurnEdits[]
    options: SelectOption[]
  } | null = null
  let turnView: TurnView | null = null

  async function resolveStoredSource(): Promise<void> {
    if (hasReadStoredSource) return
    hasReadStoredSource = true
    const top = await host
      .run(['git', 'rev-parse', '--show-toplevel'])
      .catch(loggedAs(host, 'toplevel', null))
    if (top?.exitCode !== 0) return
    toplevel = top.stdout.trim()
    const stored = await host.storeGet(sourceStoreKeyOf(toplevel))
    if (typeof stored !== 'string') return
    const parsed = sourceOf(stored)
    if (isPersistable(parsed)) source = parsed
  }

  async function refresh(repository: Repository): Promise<void> {
    toplevel = repository?.toplevel ?? null
    const started = ++generation

    const [head, messages] = await Promise.all([
      host.run(['git', 'rev-parse', 'HEAD']).catch(loggedAs(host, 'HEAD', null)),
      host.messages().catch(loggedAs<readonly SessionMessage[]>(host, 'session messages', [])),
    ])
    if (started !== generation) return

    const headSha = head && head.exitCode === 0 ? head.stdout.trim() : null
    if (repository && sessionStartSha === null && headSha !== null) sessionStartSha = headSha

    if (headSha !== lastBranchPointHeadSha || toplevel !== lastBranchPointToplevel) {
      const resolved =
        headSha === null
          ? null
          : await branchPointOf(host.run).catch(loggedAs(host, 'branch point', null))
      if (started !== generation) return
      branchPointSha = resolved
      lastBranchPointHeadSha = headSha
      lastBranchPointToplevel = toplevel
    }

    if (messages.length !== lastMessagesLength || messages.at(-1) !== lastMessage) {
      lastMessagesLength = messages.length
      lastMessage = messages.at(-1)
      turns = turnEditsOf(messages)
    }
  }

  function base(): Base {
    if (source.kind === 'session' && sessionStartSha !== null)
      return { kind: 'commit', sha: sessionStartSha }
    if (source.kind === 'branch-point' && branchPointSha !== null)
      return { kind: 'commit', sha: branchPointSha }
    return { kind: 'head' }
  }

  function turnViewOf(index: number): TurnView {
    if (turnView && turnView.turns === turns && turnView.index === index) return turnView

    const files = turnFilesOf(turns, index).map(changedFileOfTurnFile)
    const hunksByPath = new Map(turnFilesOf(turns, index).map(file => [file.path, file.hunks]))
    turnView = { turns, index, files, hunksByPath }
    return turnView
  }

  function files(repository: Repository): readonly ChangedFile[] {
    return source.kind === 'turn' ? turnViewOf(source.index).files : (repository?.files ?? [])
  }

  function hunksFor(file: ChangedFile): readonly Hunk[] | undefined {
    return source.kind === 'turn' ? turnViewOf(source.index).hunksByPath.get(file.path) : undefined
  }

  function options(): SelectOption[] {
    const hasBranchPoint = branchPointSha !== null
    if (
      optionsCache &&
      optionsCache.hasBranchPoint === hasBranchPoint &&
      optionsCache.turns === turns
    ) {
      return optionsCache.options
    }
    const resolved = sourceOptionsOf({ hasBranchPoint, turns })
    optionsCache = { hasBranchPoint, turns, options: resolved }
    return resolved
  }

  function select(value: string): void {
    source = sourceOf(value)
    if (isPersistable(source) && toplevel) {
      void host
        .storeSet(sourceStoreKeyOf(toplevel), value)
        .catch(loggedAs(host, 'saving the source', undefined))
    }
  }

  function isReadOnly(): boolean {
    return source.kind === 'turn'
  }

  return {
    resolveStoredSource,
    refresh,
    source: () => source,
    base,
    files,
    hunksFor,
    options,
    select,
    isReadOnly,
  }
}

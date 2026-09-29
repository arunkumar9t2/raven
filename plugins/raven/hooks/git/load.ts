import type { RunResult } from '../core/host'
import type { ChangedFile } from './changes'
import { changedFilesOf, numstatOf, statusEntriesOf } from './changes'
import type { Hunk } from './hunks'
import { hunksOf } from './hunks'
import { applyArgvOf } from './patch'

export type Run = (argv: readonly string[], stdin?: string) => Promise<RunResult>

/** What the working tree is diffed against: `HEAD`, or a specific commit (a session start or a merge-base). */
export type Base = { kind: 'head' } | { kind: 'commit'; sha: string }

/** The git revision a base names, for a diff argv. */
export function refOf(base: Base): string {
  return base.kind === 'head' ? 'HEAD' : base.sha
}

/**
 * Reads the working tree's changes against `base`. Returns null outside a git repo.
 */
export async function loadChanges(
  run: Run,
  base: Base,
): Promise<{ toplevel: string; files: ChangedFile[] } | null> {
  const top = await run(['git', 'rev-parse', '--show-toplevel'])
  if (top.exitCode !== 0) return null
  const [status, diff] = await Promise.all([
    run(['git', 'status', '--porcelain=v1', '-z', '--untracked-files=all']),
    run(['git', 'diff', refOf(base), '--numstat', '-z']),
  ])
  const numstat = diff.exitCode === 0 ? numstatOf(diff.stdout) : new Map()
  const entries = statusEntriesOf(status.stdout)
  const files = changedFilesOf(entries, numstat, await untrackedLinesOf(run, entries))
  return { toplevel: top.stdout.trim(), files }
}

/** Past this many new files the list shows +0 for them rather than spawning a git per file. */
const UNTRACKED_COUNT_LIMIT = 50

/** Line counts of untracked files, which `git diff HEAD` does not see. */
async function untrackedLinesOf(
  run: Run,
  entries: ReturnType<typeof statusEntriesOf>,
): Promise<Map<string, number>> {
  const paths = entries
    .filter(entry => entry.status === 'untracked')
    .slice(0, UNTRACKED_COUNT_LIMIT)
    .map(entry => entry.path)
  const counts = await Promise.all(
    paths.map(async path => {
      const result = await run(['git', 'diff', '--no-index', '--numstat', '--', '/dev/null', path])
      return [path, Number.parseInt(result.stdout, 10) || 0] as const
    }),
  )
  return new Map(counts)
}

/** One file's hunks: tracked files diff against `base`, untracked files diff against /dev/null. */
export async function loadHunks(run: Run, file: ChangedFile, base: Base): Promise<Hunk[]> {
  const argv =
    file.status === 'untracked'
      ? ['git', 'diff', '--no-index', '--', '/dev/null', file.path]
      : ['git', 'diff', refOf(base), '--', file.path]
  const result = await run(argv)
  return hunksOf(result.stdout)
}

/** Stages or reverts one hunk's patch via `git apply`, reading it from stdin. */
export async function applyPatch(
  run: Run,
  patch: string,
  mode: 'stage' | 'revert',
): Promise<{ ok: boolean; error?: string }> {
  const result = await run(applyArgvOf(mode), patch)
  return result.exitCode === 0 ? { ok: true } : { ok: false, error: result.stderr.trim() }
}

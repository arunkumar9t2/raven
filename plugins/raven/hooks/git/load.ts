import type { RunResult } from '../core/host'
import type { ChangedFile } from './changes'
import { changedFilesOf, numstatOf, statusEntriesOf } from './changes'
import type { Hunk } from './hunks'
import { hunksOf } from './hunks'

export type Run = (argv: readonly string[]) => Promise<RunResult>

/**
 * Reads the working tree's changes against HEAD. Returns null outside a git repo.
 */
export async function loadChanges(
  run: Run,
): Promise<{ toplevel: string; files: ChangedFile[] } | null> {
  const top = await run(['git', 'rev-parse', '--show-toplevel'])
  if (top.exitCode !== 0) return null
  const status = await run(['git', 'status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const diff = await run(['git', 'diff', 'HEAD', '--numstat', '-z'])
  const numstat = diff.exitCode === 0 ? numstatOf(diff.stdout) : new Map()
  const files = changedFilesOf(statusEntriesOf(status.stdout), numstat)
  return { toplevel: top.stdout.trim(), files }
}

/** One file's hunks: tracked files diff against HEAD, untracked files diff against /dev/null. */
export async function loadHunks(run: Run, file: ChangedFile): Promise<Hunk[]> {
  const argv =
    file.status === 'untracked'
      ? ['git', 'diff', '--no-index', '--', '/dev/null', file.path]
      : ['git', 'diff', 'HEAD', '--', file.path]
  const result = await run(argv)
  return hunksOf(result.stdout)
}

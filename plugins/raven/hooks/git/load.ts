import type { RunResult } from '../core/host'
import type { ChangedFile } from './changes'
import { changedFilesOf, numstatOf, statusEntriesOf } from './changes'
import type { Hunk } from './hunks'
import { hunksOf } from './hunks'
import { applyArgvOf } from './patch'

export type Run = (argv: readonly string[], stdin?: string) => Promise<RunResult>

/** A run's trimmed stdout when it exits 0, else null. */
export function outputOf(result: RunResult): string | null {
  return result.exitCode === 0 ? result.stdout.trim() : null
}

/** The repository's root, or null outside a git repository. */
export async function toplevelOf(run: Run): Promise<string | null> {
  return outputOf(await run(['git', 'rev-parse', '--show-toplevel']))
}

/**
 * Which of `paths` (repository-toplevel-relative, the same frame every `ChangedFile.path` and
 * stored `Comment.path` is in) currently exist in the working tree — tracked or untracked (but
 * not gitignored) — one batched `git ls-files` call covering all of them, never one per path.
 * Run with `-C toplevel`, not the session's cwd: a pathspec is read relative to cwd, and the
 * session's cwd can sit below the toplevel, which would read every candidate as missing.
 * `--literal-pathspecs` also keeps a path containing `[`/`*`/`?` from being read as a glob.
 * `null` means the check itself failed (a non-zero exit), not that nothing exists; callers treat
 * that the same as "unknown" elsewhere in Raven: fail open rather than risk calling a comment's
 * file gone over an infra hiccup. `paths` empty needs no call.
 */
export async function existingPathsOf(
  run: Run,
  toplevel: string,
  paths: readonly string[],
): Promise<ReadonlySet<string> | null> {
  if (paths.length === 0) return new Set()
  const result = await run([
    'git',
    '--literal-pathspecs',
    '-C',
    toplevel,
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
    '--',
    ...paths,
  ])
  if (result.exitCode !== 0) return null
  return new Set(result.stdout.split('\0').filter(token => token.length > 0))
}

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
  // Outside a repository status and diff fail harmlessly, so all three start together.
  const [toplevel, status, diff] = await Promise.all([
    toplevelOf(run),
    run(['git', 'status', '--porcelain=v1', '-z', '--untracked-files=all']),
    run(['git', 'diff', refOf(base), '--numstat', '-z']),
  ])
  if (toplevel === null) return null
  const numstat = diff.exitCode === 0 ? numstatOf(diff.stdout) : new Map()
  const entries = statusEntriesOf(status.stdout)
  const files = changedFilesOf(entries, numstat, await untrackedLinesOf(run, entries))
  return { toplevel, files }
}

/** Past this many new files the list shows +0 for them rather than spawning a git per file. */
export const UNTRACKED_COUNT_LIMIT = 50

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

/**
 * One file's hunks (all but a cut-off last one when the diff overran the output cap): tracked files diff against `base`, untracked files diff against /dev/null, and
 * a renamed file diffs with rename detection (`-M`) against both its old and new path — diffing
 * the new path alone would compare it against nothing at `base` and show the whole file as added.
 */
export async function loadHunks(
  run: Run,
  file: ChangedFile,
  base: Base,
): Promise<{ hunks: Hunk[]; isTruncated: boolean }> {
  const argv =
    file.status === 'untracked'
      ? ['git', 'diff', '--no-index', '--', '/dev/null', file.path]
      : file.status === 'renamed' && file.oldPath
        ? ['git', 'diff', '-M', refOf(base), '--', file.oldPath, file.path]
        : ['git', 'diff', refOf(base), '--', file.path]
  const result = await run(argv)
  const hunks = hunksOf(result.stdout)
  // A diff past the engine's output cap ends mid-hunk: drop that last hunk rather than show (or
  // let anyone stage) half of it.
  return result.isStdoutTruncated
    ? { hunks: hunks.slice(0, -1), isTruncated: true }
    : { hunks, isTruncated: false }
}

/**
 * The path a `diff --git` section changes: the rename target, the new file, else the old one.
 * git appends a tab to a ---/+++ name containing a space; it is not part of the path.
 */
function sectionPathOf(section: string): string | null {
  const path =
    /^rename to (.+)$/m.exec(section)?.[1] ??
    /^\+\+\+ b\/(.+)$/m.exec(section)?.[1] ??
    /^--- a\/(.+)$/m.exec(section)?.[1] ??
    /^diff --git a\/.+ b\/(.+)$/m.exec(section)?.[1]
  return path === undefined ? null : path.replace(/\t$/, '')
}

/** A multi-file `git diff` cut at its `diff --git` lines, keyed by the path each section changes. */
export function diffSectionsOf(diff: string): Map<string, string> {
  const sections = new Map<string, string>()
  for (const part of diff.split(/^(?=diff --git )/m)) {
    if (!part.startsWith('diff --git ')) continue
    const path = sectionPathOf(part)
    if (path !== null) sections.set(path, part)
  }
  return sections
}

export type LoadedHunks = {
  /**
   * Hunks per path; a path absent here was not read (an untracked file past the cap, or one
   * whose read failed).
   */
  byPath: ReadonlyMap<string, readonly Hunk[]>
  /** The file the output cap cut mid-diff (its last hunk dropped), or null. */
  truncatedPath: string | null
}

/** One file's `[path, hunks]` entry for `loadAllHunks`'s per-file reads; null on a rejected read, so one bad file leaves only itself unread rather than failing the whole call. */
async function oneHunksEntryOf(
  run: Run,
  file: ChangedFile,
  base: Base,
): Promise<readonly [string, readonly Hunk[]] | null> {
  try {
    return [file.path, (await loadHunks(run, file, base)).hunks]
  } catch {
    return null
  }
}

/**
 * Every changed file's hunks against `base`: one `git diff -M` for all tracked files (no
 * pathspec, so no argv limit), split per file; untracked files one `--no-index` read each, up to
 * `UNTRACKED_COUNT_LIMIT`. Past the 4 MiB output cap the cut file keeps its whole hunks and the
 * files after it are read together. A non-zero exit from the all-files diff (e.g. a bad
 * revision) throws rather than silently reading every tracked file as unchanged.
 */
export async function loadAllHunks(
  run: Run,
  files: readonly ChangedFile[],
  base: Base,
): Promise<LoadedHunks> {
  const tracked = files.filter(file => file.status !== 'untracked')
  const untracked = files
    .filter(file => file.status === 'untracked')
    .slice(0, UNTRACKED_COUNT_LIMIT)
  const byPath = new Map<string, readonly Hunk[]>()
  let truncatedPath: string | null = null

  if (tracked.length > 0) {
    const result = await run(['git', '-c', 'core.quotePath=false', 'diff', '-M', refOf(base)])
    if (result.exitCode !== 0) {
      throw new Error(`git diff failed: ${result.stderr.trim()}`)
    }
    const sections = [...diffSectionsOf(result.stdout)]
    sections.forEach(([path, section], index) => {
      const hunks = hunksOf(section)
      const isCut = result.isStdoutTruncated === true && index === sections.length - 1
      if (isCut) truncatedPath = path
      byPath.set(path, isCut ? hunks.slice(0, -1) : hunks)
    })
    const missing = tracked.filter(file => !byPath.has(file.path))
    if (result.isStdoutTruncated && missing.length > 0) {
      const reread = await Promise.all(missing.map(file => oneHunksEntryOf(run, file, base)))
      for (const entry of reread) if (entry) byPath.set(entry[0], entry[1])
    } else {
      for (const file of missing) byPath.set(file.path, [])
    }
  }

  const read = await Promise.all(untracked.map(file => oneHunksEntryOf(run, file, base)))
  for (const entry of read) if (entry) byPath.set(entry[0], entry[1])
  return { byPath, truncatedPath }
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

import type { Run } from './load'

const CANDIDATE_BRANCHES = ['main', 'master']

/** The repository's default branch: origin's HEAD symref, else the first of `main`/`master` that exists. */
async function defaultBranchOf(run: Run): Promise<string | null> {
  const symref = await run(['git', 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (symref.exitCode === 0) {
    const name = symref.stdout.trim()
    const branch = name.startsWith('origin/') ? name.slice('origin/'.length) : name
    if (branch !== '') return branch
  }
  for (const candidate of CANDIDATE_BRANCHES) {
    const verify = await run(['git', 'rev-parse', '--verify', candidate])
    if (verify.exitCode === 0) return candidate
  }
  return null
}

/** HEAD's merge-base with the repository's default branch; null when neither resolves. */
export async function branchPointOf(run: Run): Promise<string | null> {
  const branch = await defaultBranchOf(run)
  if (branch === null) return null
  const result = await run(['git', 'merge-base', 'HEAD', branch])
  return result.exitCode === 0 ? result.stdout.trim() : null
}

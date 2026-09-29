import { describe, expect, test } from 'bun:test'
import { branchPointOf } from '../../hooks/git/base'
import type { Run } from '../../hooks/git/load'

type RunResultLike = { exitCode?: number; stdout?: string; stderr?: string }

const runOf = (outputs: Record<string, RunResultLike>): Run => {
  return async argv => {
    const key = argv.join(' ')
    const out = outputs[key]
    if (!out) throw new Error(`unexpected argv: ${key}`)
    return { exitCode: out.exitCode ?? 0, stdout: out.stdout ?? '', stderr: out.stderr ?? '' }
  }
}

describe('branchPointOf', () => {
  test('uses origin/HEAD symref, stripped of the remote name', async () => {
    const run = runOf({
      'git symbolic-ref --short refs/remotes/origin/HEAD': { stdout: 'origin/develop\n' },
      'git merge-base HEAD develop': { stdout: 'abc123\n' },
    })
    expect(await branchPointOf(run)).toBe('abc123')
  })

  test('falls back to main when the symref is unresolvable', async () => {
    const run = runOf({
      'git symbolic-ref --short refs/remotes/origin/HEAD': { exitCode: 128 },
      'git rev-parse --verify main': { stdout: 'sha-main\n' },
      'git merge-base HEAD main': { stdout: 'def456\n' },
    })
    expect(await branchPointOf(run)).toBe('def456')
  })

  test('falls back to master when main does not verify', async () => {
    const run = runOf({
      'git symbolic-ref --short refs/remotes/origin/HEAD': { exitCode: 128 },
      'git rev-parse --verify main': { exitCode: 1 },
      'git rev-parse --verify master': { stdout: 'sha-master\n' },
      'git merge-base HEAD master': { stdout: 'ghi789\n' },
    })
    expect(await branchPointOf(run)).toBe('ghi789')
  })

  test('null when neither the symref nor main/master resolve', async () => {
    const run = runOf({
      'git symbolic-ref --short refs/remotes/origin/HEAD': { exitCode: 128 },
      'git rev-parse --verify main': { exitCode: 1 },
      'git rev-parse --verify master': { exitCode: 1 },
    })
    expect(await branchPointOf(run)).toBeNull()
  })

  test('null when the default branch resolves but shares no history with HEAD', async () => {
    const run = runOf({
      'git symbolic-ref --short refs/remotes/origin/HEAD': { stdout: 'origin/main\n' },
      'git merge-base HEAD main': { exitCode: 1 },
    })
    expect(await branchPointOf(run)).toBeNull()
  })
})

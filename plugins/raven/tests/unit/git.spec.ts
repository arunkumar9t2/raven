import { describe, expect, test } from 'bun:test'
import { changedFilesOf, numstatOf, statusEntriesOf } from '../../hooks/git/changes'
import { clampHunk, hunksOf, lineKindOf } from '../../hooks/git/hunks'
import type { Base, Run } from '../../hooks/git/load'
import { applyPatch, loadChanges, loadHunks } from '../../hooks/git/load'

describe('statusEntriesOf', () => {
  test('parses modified, added, deleted, untracked, and renamed entries', () => {
    const z = [
      ' M modified.txt',
      'A  added.txt',
      'D  deleted.txt',
      '?? untracked.txt',
      'R  new.txt',
      'old.txt',
    ].join('\0')
    expect(statusEntriesOf(z)).toEqual([
      { path: 'modified.txt', status: 'modified' },
      { path: 'added.txt', status: 'added' },
      { path: 'deleted.txt', status: 'deleted' },
      { path: 'untracked.txt', status: 'untracked' },
      { path: 'new.txt', oldPath: 'old.txt', status: 'renamed' },
    ])
  })

  test('ignores explicitly-ignored entries', () => {
    const z = ['!! ignored.txt', ' M modified.txt'].join('\0')
    expect(statusEntriesOf(z)).toEqual([{ path: 'modified.txt', status: 'modified' }])
  })
})

describe('numstatOf', () => {
  test('parses regular, binary, and rename records', () => {
    const z = [
      '3\t1\tmodified.txt',
      '5\t0\tadded.txt',
      '-\t-\timage.png',
      '2\t2\t\0new.txt\0old.txt',
    ].join('\0')
    const map = numstatOf(z)
    expect(map.get('modified.txt')).toEqual({ adds: 3, dels: 1, isBinary: false })
    expect(map.get('added.txt')).toEqual({ adds: 5, dels: 0, isBinary: false })
    expect(map.get('image.png')).toEqual({ adds: 0, dels: 0, isBinary: true })
    expect(map.get('new.txt')).toEqual({ adds: 2, dels: 2, isBinary: false })
  })
})

describe('changedFilesOf', () => {
  test('joins status and numstat, sorted by path, with untracked line counts', () => {
    const status = statusEntriesOf(
      [' M modified.txt', '?? untracked.txt', 'A  added.txt'].join('\0'),
    )
    const numstat = numstatOf(['3\t1\tmodified.txt', '5\t0\tadded.txt'].join('\0'))
    const untrackedLines = new Map([['untracked.txt', 7]])
    expect(changedFilesOf(status, numstat, untrackedLines)).toEqual([
      { path: 'added.txt', oldPath: undefined, status: 'added', adds: 5, dels: 0, isBinary: false },
      {
        path: 'modified.txt',
        oldPath: undefined,
        status: 'modified',
        adds: 3,
        dels: 1,
        isBinary: false,
      },
      {
        path: 'untracked.txt',
        oldPath: undefined,
        status: 'untracked',
        adds: 7,
        dels: 0,
        isBinary: false,
      },
    ])
  })

  test('defaults untracked adds to 0 when no line-count map is given', () => {
    const status = statusEntriesOf('?? untracked.txt')
    expect(changedFilesOf(status, numstatOf(''))).toEqual([
      {
        path: 'untracked.txt',
        oldPath: undefined,
        status: 'untracked',
        adds: 0,
        dels: 0,
        isBinary: false,
      },
    ])
  })
})

const MODIFIED_DIFF = [
  'diff --git a/foo.txt b/foo.txt',
  'index abc..def 100644',
  '--- a/foo.txt',
  '+++ b/foo.txt',
  '@@ -1,3 +1,3 @@',
  ' line1',
  '-line2',
  '+line2b',
  ' line3',
  '@@ -10,2 +10,3 @@',
  ' line10',
  '+line11',
  ' line12',
  '',
].join('\n')

const NEW_FILE_DIFF = [
  'diff --git a/dev/null b/newfile.txt',
  'new file mode 100644',
  'index 0000000..abc',
  '--- /dev/null',
  '+++ b/newfile.txt',
  '@@ -0,0 +1,2 @@',
  '+hello',
  '+world',
  '',
].join('\n')

describe('hunksOf', () => {
  test('splits a two-hunk diff, dropping the preamble', () => {
    const hunks = hunksOf(MODIFIED_DIFF)
    expect(hunks).toHaveLength(2)
    expect(hunks[0]).toEqual({
      header: '@@ -1,3 +1,3 @@',
      text: '@@ -1,3 +1,3 @@\n line1\n-line2\n+line2b\n line3\n',
    })
    expect(hunks[1]).toEqual({
      header: '@@ -10,2 +10,3 @@',
      text: '@@ -10,2 +10,3 @@\n line10\n+line11\n line12\n',
    })
  })

  test('handles a new-file diff', () => {
    const hunks = hunksOf(NEW_FILE_DIFF)
    expect(hunks).toEqual([
      { header: '@@ -0,0 +1,2 @@', text: '@@ -0,0 +1,2 @@\n+hello\n+world\n' },
    ])
  })
})

describe('lineKindOf', () => {
  test('classifies add, del and context lines', () => {
    expect(lineKindOf('+added')).toBe('add')
    expect(lineKindOf('-removed')).toBe('del')
    expect(lineKindOf(' context')).toBe('context')
  })

  test('treats an empty line and the no-newline marker as neither', () => {
    expect(lineKindOf('')).toBeNull()
    expect(lineKindOf('\\ No newline at end of file')).toBeNull()
  })
})

describe('clampHunk', () => {
  test('returns the hunk unchanged when under the cap', () => {
    const hunk = { header: '@@ -1,1 +1,1 @@', text: '@@ -1,1 +1,1 @@\n line1\n' }
    expect(clampHunk(hunk, 10000)).toBe(hunk)
  })

  test('cuts at a line boundary, stays under the cap and counts the rest', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `+line ${i}`)
    const hunk = { header: '@@ -0,0 +1,10 @@', text: `@@ -0,0 +1,10 @@\n${lines.join('\n')}\n` }
    const { text } = clampHunk(hunk, 80)
    const kept = text.split('\n').filter(line => line.startsWith('+line')).length

    expect(text.length).toBeLessThanOrEqual(80)
    expect(text.startsWith('@@ -0,0 +1,10 @@\n')).toBe(true)
    expect(text.endsWith(` … (${10 - kept} more lines)\n`)).toBe(true)
  })

  test('keeps the header even when the cap is tiny', () => {
    const hunk = { header: '@@ -1,2 +1,2 @@', text: '@@ -1,2 +1,2 @@\n-a\n+b\n' }
    expect(clampHunk(hunk, 20).text).toBe('@@ -1,2 +1,2 @@\n … (2 more lines)\n')
  })
})

const runOf = (outputs: Record<string, RunResultLike>): Run => {
  return async argv => {
    const key = argv.join(' ')
    const out = outputs[key]
    if (!out) throw new Error(`unexpected argv: ${key}`)
    return {
      exitCode: out.exitCode ?? 0,
      stdout: out.stdout ?? '',
      stderr: out.stderr ?? '',
      isStdoutTruncated: out.isStdoutTruncated,
    }
  }
}

type RunResultLike = {
  exitCode?: number
  stdout?: string
  stderr?: string
  isStdoutTruncated?: boolean
}

const HEAD: Base = { kind: 'head' }

describe('loadChanges', () => {
  test('returns null outside a git repo', async () => {
    // status and the HEAD diff run in parallel with the toplevel check, so they get fixtures too.
    const run = runOf({
      'git rev-parse --show-toplevel': { exitCode: 128 },
      'git status --porcelain=v1 -z --untracked-files=all': { exitCode: 128 },
      'git diff HEAD --numstat -z': { exitCode: 128 },
    })
    expect(await loadChanges(run, HEAD)).toBeNull()
  })

  test('joins status and numstat under the repo toplevel', async () => {
    const run = runOf({
      'git rev-parse --show-toplevel': { stdout: '/repo\n' },
      'git status --porcelain=v1 -z --untracked-files=all': { stdout: ' M foo.txt' },
      'git diff HEAD --numstat -z': { stdout: '3\t1\tfoo.txt' },
    })
    expect(await loadChanges(run, HEAD)).toEqual({
      toplevel: '/repo',
      files: [
        {
          path: 'foo.txt',
          oldPath: undefined,
          status: 'modified',
          adds: 3,
          dels: 1,
          isBinary: false,
        },
      ],
    })
  })

  test('treats numstat as empty when the HEAD diff fails (unborn HEAD)', async () => {
    const run = runOf({
      'git rev-parse --show-toplevel': { stdout: '/repo\n' },
      'git status --porcelain=v1 -z --untracked-files=all': { stdout: 'A  foo.txt' },
      'git diff HEAD --numstat -z': { exitCode: 128 },
    })
    expect(await loadChanges(run, HEAD)).toEqual({
      toplevel: '/repo',
      files: [
        { path: 'foo.txt', oldPath: undefined, status: 'added', adds: 0, dels: 0, isBinary: false },
      ],
    })
  })
})

describe('loadHunks', () => {
  test('diffs a tracked file against HEAD', async () => {
    const run = runOf({ 'git diff HEAD -- foo.txt': { stdout: MODIFIED_DIFF } })
    const file = { path: 'foo.txt', status: 'modified' as const, adds: 1, dels: 1, isBinary: false }
    expect((await loadHunks(run, file, HEAD)).hunks).toHaveLength(2)
  })

  test('diffs a tracked file against a commit base', async () => {
    const run = runOf({ 'git diff abc123 -- foo.txt': { stdout: MODIFIED_DIFF } })
    const file = { path: 'foo.txt', status: 'modified' as const, adds: 1, dels: 1, isBinary: false }
    expect((await loadHunks(run, file, { kind: 'commit', sha: 'abc123' })).hunks).toHaveLength(2)
  })

  test('diffs an untracked file against /dev/null, treating exit 1 as success', async () => {
    const run = runOf({
      'git diff --no-index -- /dev/null newfile.txt': { exitCode: 1, stdout: NEW_FILE_DIFF },
    })
    const file = {
      path: 'newfile.txt',
      status: 'untracked' as const,
      adds: 2,
      dels: 0,
      isBinary: false,
    }
    expect((await loadHunks(run, file, HEAD)).hunks).toEqual([
      { header: '@@ -0,0 +1,2 @@', text: '@@ -0,0 +1,2 @@\n+hello\n+world\n' },
    ])
  })

  test('diffs a renamed file with rename detection against both its old and new path', async () => {
    const run = runOf({ 'git diff -M HEAD -- old.txt foo.txt': { stdout: MODIFIED_DIFF } })
    const file = {
      path: 'foo.txt',
      oldPath: 'old.txt',
      status: 'renamed' as const,
      adds: 1,
      dels: 1,
      isBinary: false,
    }
    expect((await loadHunks(run, file, HEAD)).hunks).toHaveLength(2)
  })

  test('a renamed file with no oldPath falls back to diffing the new path alone', async () => {
    const run = runOf({ 'git diff HEAD -- foo.txt': { stdout: MODIFIED_DIFF } })
    const file = { path: 'foo.txt', status: 'renamed' as const, adds: 1, dels: 1, isBinary: false }
    expect((await loadHunks(run, file, HEAD)).hunks).toHaveLength(2)
  })

  test('drops the cut-off last hunk of a diff the output cap truncated', async () => {
    const run = runOf({
      'git diff HEAD -- foo.txt': { stdout: MODIFIED_DIFF, isStdoutTruncated: true },
    })
    const file = { path: 'foo.txt', status: 'modified' as const, adds: 1, dels: 1, isBinary: false }
    const loaded = await loadHunks(run, file, HEAD)
    expect(loaded.isTruncated).toBe(true)
    expect(loaded.hunks).toHaveLength(1)
  })
})

describe('applyPatch', () => {
  test('stage runs git apply --cached with the patch on stdin, ok on exit 0', async () => {
    const seen: { argv?: readonly string[]; stdin?: string } = {}
    const run: Run = async (argv, stdin) => {
      seen.argv = argv
      seen.stdin = stdin
      return { exitCode: 0, stdout: '', stderr: '' }
    }

    const result = await applyPatch(run, 'a patch\n', 'stage')

    expect(result).toEqual({ ok: true })
    expect(seen).toEqual({
      argv: ['git', 'apply', '--cached', '--recount', '-'],
      stdin: 'a patch\n',
    })
  })

  test('revert runs git apply -R with the patch on stdin', async () => {
    const seen: { argv?: readonly string[]; stdin?: string } = {}
    const run: Run = async (argv, stdin) => {
      seen.argv = argv
      seen.stdin = stdin
      return { exitCode: 0, stdout: '', stderr: '' }
    }

    await applyPatch(run, 'a patch\n', 'revert')

    expect(seen).toEqual({ argv: ['git', 'apply', '-R', '--recount', '-'], stdin: 'a patch\n' })
  })

  test('a nonzero exit reports the trimmed stderr and ok: false', async () => {
    const run: Run = async () => ({ exitCode: 1, stdout: '', stderr: 'patch does not apply\n' })

    expect(await applyPatch(run, 'a patch\n', 'stage')).toEqual({
      ok: false,
      error: 'patch does not apply',
    })
  })
})

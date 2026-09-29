import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'bun'
import type { ChangedFile } from '../../hooks/git/changes'
import { hunksOf } from '../../hooks/git/hunks'
import { applyArgvOf, patchOf } from '../../hooks/git/patch'

const HUNK = {
  header: '@@ -1,3 +1,3 @@',
  text: '@@ -1,3 +1,3 @@\n line1\n-line2\n+line2b\n line3\n',
}

const fileOf = (status: ChangedFile['status'], path = 'foo.txt'): ChangedFile => ({
  path,
  status,
  adds: 1,
  dels: 1,
  isBinary: false,
})

describe('patchOf', () => {
  test('builds a modified-file header', () => {
    expect(patchOf(fileOf('modified'), HUNK)).toBe(
      `diff --git a/foo.txt b/foo.txt\n--- a/foo.txt\n+++ b/foo.txt\n${HUNK.text}`,
    )
  })

  test('builds a renamed-file header from the new path', () => {
    expect(patchOf(fileOf('renamed'), HUNK)).toBe(
      `diff --git a/foo.txt b/foo.txt\n--- a/foo.txt\n+++ b/foo.txt\n${HUNK.text}`,
    )
  })

  test('builds an untracked-file header', () => {
    expect(patchOf(fileOf('untracked'), HUNK)).toBe(
      'diff --git a/foo.txt b/foo.txt\nnew file mode 100644\n--- /dev/null\n+++ b/foo.txt\n' +
        HUNK.text,
    )
  })

  test('builds an added-file header', () => {
    expect(patchOf(fileOf('added'), HUNK)).toBe(
      'diff --git a/foo.txt b/foo.txt\nnew file mode 100644\n--- /dev/null\n+++ b/foo.txt\n' +
        HUNK.text,
    )
  })

  test('builds a deleted-file header', () => {
    expect(patchOf(fileOf('deleted'), HUNK)).toBe(
      'diff --git a/foo.txt b/foo.txt\ndeleted file mode 100644\n--- a/foo.txt\n+++ /dev/null\n' +
        HUNK.text,
    )
  })
})

describe('applyArgvOf', () => {
  test('stage', () => {
    expect(applyArgvOf('stage')).toEqual(['git', 'apply', '--cached', '--recount', '-'])
  })

  test('revert', () => {
    expect(applyArgvOf('revert')).toEqual(['git', 'apply', '-R', '--recount', '-'])
  })
})

async function run(cmd: string[], cwd: string): Promise<string> {
  const proc = spawn({ cmd, cwd, stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) throw new Error(`${cmd.join(' ')} failed: ${stderr}`)
  return stdout
}

async function runWithStdin(cmd: string[], cwd: string, input: string): Promise<void> {
  const proc = spawn({ cmd, cwd, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })
  proc.stdin.write(input)
  proc.stdin.end()
  const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited])
  if (exitCode !== 0) throw new Error(`${cmd.join(' ')} failed: ${stderr}`)
}

describe('patchOf + applyArgvOf integration', () => {
  let dir: string

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  test('stages only the second hunk of a two-hunk diff', async () => {
    dir = await mkdtemp(join(tmpdir(), 'raven-patch-'))
    await run(['git', 'init', '-q'], dir)
    await run(['git', 'config', 'user.email', 'test@test.com'], dir)
    await run(['git', 'config', 'user.name', 'test'], dir)

    const original = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
    await writeFile(join(dir, 'foo.txt'), `${original.join('\n')}\n`)
    await run(['git', 'add', 'foo.txt'], dir)
    await run(['git', 'commit', '-q', '-m', 'init'], dir)

    const modified = [...original]
    modified[1] = 'line 2 changed'
    modified[17] = 'line 18 changed'
    await writeFile(join(dir, 'foo.txt'), `${modified.join('\n')}\n`)

    const diff = await run(['git', 'diff', '-U1', '--', 'foo.txt'], dir)
    const hunks = hunksOf(diff)
    expect(hunks).toHaveLength(2)

    const file = fileOf('modified')
    const patch = patchOf(file, hunks[1]!)
    await runWithStdin(applyArgvOf('stage'), dir, patch)

    const staged = await run(['git', 'diff', '--cached'], dir)
    expect(staged).toContain('line 18 changed')
    expect(staged).not.toContain('line 2 changed')

    const unstaged = await run(['git', 'diff'], dir)
    expect(unstaged).toContain('line 2 changed')
    expect(unstaged).not.toContain('line 18 changed')
  })

  test('revert removes a modified hunk from the working file', async () => {
    dir = await mkdtemp(join(tmpdir(), 'raven-patch-'))
    await run(['git', 'init', '-q'], dir)
    await run(['git', 'config', 'user.email', 'test@test.com'], dir)
    await run(['git', 'config', 'user.name', 'test'], dir)

    const original = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`)
    await writeFile(join(dir, 'foo.txt'), `${original.join('\n')}\n`)
    await run(['git', 'add', 'foo.txt'], dir)
    await run(['git', 'commit', '-q', '-m', 'init'], dir)

    const modified = [...original]
    modified[1] = 'line 2 changed'
    modified[17] = 'line 18 changed'
    await writeFile(join(dir, 'foo.txt'), `${modified.join('\n')}\n`)

    const diff = await run(['git', 'diff', '-U1', '--', 'foo.txt'], dir)
    const hunks = hunksOf(diff)

    const file = fileOf('modified')
    const patch = patchOf(file, hunks[0]!)
    await runWithStdin(applyArgvOf('revert'), dir, patch)

    const working = await Bun.file(join(dir, 'foo.txt')).text()
    expect(working).not.toContain('line 2 changed')
    expect(working).toContain('line 18 changed')
  })
})

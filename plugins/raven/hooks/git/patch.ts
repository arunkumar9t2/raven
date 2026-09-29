import type { ChangedFile } from './changes'
import type { Hunk } from './hunks'

/** A patch applying one hunk of one file, as `git apply` reads it from stdin. */
export function patchOf(file: ChangedFile, hunk: Hunk): string {
  const p = file.path
  if (file.status === 'renamed' && file.oldPath) {
    const old = file.oldPath
    // `git apply` needs the `rename from`/`rename to` lines to know the hunk's `a/`/`b/` sides
    // name different paths; without them it reads this as a diff of a file against itself.
    const header = `diff --git a/${old} b/${p}\nrename from ${old}\nrename to ${p}\n--- a/${old}\n+++ b/${p}\n`
    return header + hunk.text
  }
  const header =
    file.status === 'deleted'
      ? `diff --git a/${p} b/${p}\ndeleted file mode 100644\n--- a/${p}\n+++ /dev/null\n`
      : file.status === 'untracked' || file.status === 'added'
        ? `diff --git a/${p} b/${p}\nnew file mode 100644\n--- /dev/null\n+++ b/${p}\n`
        : `diff --git a/${p} b/${p}\n--- a/${p}\n+++ b/${p}\n`
  return header + hunk.text
}

/** argv for staging (`cached`) or reverting (`reverse`) a patch read from stdin. */
export function applyArgvOf(mode: 'stage' | 'revert'): string[] {
  return mode === 'stage'
    ? ['git', 'apply', '--cached', '--recount', '-']
    : ['git', 'apply', '-R', '--recount', '-']
}

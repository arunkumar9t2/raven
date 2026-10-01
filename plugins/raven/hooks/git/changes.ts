export type ChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked'

export type ChangedFile = {
  path: string
  oldPath?: string
  status: ChangeStatus
  adds: number
  dels: number
  isBinary: boolean
}

type StatusEntry = { path: string; oldPath?: string; status: ChangeStatus }

/** Parses `git status --porcelain=v1 -z --untracked-files=all` output. */
export function statusEntriesOf(z: string): StatusEntry[] {
  const tokens = z.split('\0').filter(token => token.length > 0)
  const entries: StatusEntry[] = []
  let i = 0
  while (i < tokens.length) {
    const token = tokens[i] as string
    const xy = token.slice(0, 2)
    const path = token.slice(3)
    i++
    if (xy === '!!') continue
    if (xy === '??') {
      entries.push({ path, status: 'untracked' })
      continue
    }
    if (xy.includes('R')) {
      const oldPath = tokens[i]
      i++
      entries.push({ path, oldPath, status: 'renamed' })
      continue
    }
    if (xy.includes('D')) {
      entries.push({ path, status: 'deleted' })
    } else if (xy.includes('A')) {
      entries.push({ path, status: 'added' })
    } else {
      entries.push({ path, status: 'modified' })
    }
  }
  return entries
}

type NumstatEntry = { adds: number; dels: number; isBinary: boolean }

/**
 * Parses `git diff HEAD --numstat -z` output into a map path → {adds, dels, isBinary}.
 * A rename record carries an empty path field followed by the old and new paths as separate
 * NUL-terminated fields; "-\t-" in the count fields means a binary file.
 */
export function numstatOf(z: string): Map<string, NumstatEntry> {
  const tokens = z.split('\0').filter(token => token.length > 0)
  const map = new Map<string, NumstatEntry>()
  let i = 0
  while (i < tokens.length) {
    const record = tokens[i] as string
    i++
    const [addsField, delsField, path] = record.split('\t')
    const isBinary = addsField === '-' || delsField === '-'
    const adds = isBinary ? 0 : Number(addsField)
    const dels = isBinary ? 0 : Number(delsField)
    if (path === '') {
      const newPath = tokens[i + 1] as string
      i += 2 // old path, then new path
      map.set(newPath, { adds, dels, isBinary })
    } else {
      map.set(path as string, { adds, dels, isBinary })
    }
  }
  return map
}

/**
 * Joins status entries with numstat counts, sorted by path. Untracked files get their `adds` from
 * `untrackedLines` (path → line count) when given, else 0.
 */
export function changedFilesOf(
  status: ReturnType<typeof statusEntriesOf>,
  numstat: ReturnType<typeof numstatOf>,
  untrackedLines?: Map<string, number>,
): ChangedFile[] {
  const files = status.map(entry => {
    const stat = numstat.get(entry.path)
    const isBinary = stat?.isBinary ?? false
    const adds =
      entry.status === 'untracked' ? (untrackedLines?.get(entry.path) ?? 0) : (stat?.adds ?? 0)
    const dels = entry.status === 'untracked' ? 0 : (stat?.dels ?? 0)
    return { path: entry.path, oldPath: entry.oldPath, status: entry.status, adds, dels, isBinary }
  })
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}

import type { ChangeStatus } from '../../git/changes'

/** A directory node; the tree's root is one. */
export type TreeDir = Extract<TreeNode, { kind: 'dir' }>

export type TreeNode =
  | { kind: 'dir'; path: string; name: string; children: TreeNode[]; changed: number }
  | { kind: 'file'; path: string; name: string; status?: ChangeStatus }

type DirBuild = {
  name: string
  path: string
  dirs: Map<string, DirBuild>
  files: Map<string, string>
}

function dirOf(root: DirBuild, path: string): DirBuild {
  if (path === '') return root
  const parts = path.split('/')
  let node = root
  let built = ''
  for (const part of parts) {
    built = built === '' ? part : `${built}/${part}`
    let next = node.dirs.get(part)
    if (!next) {
      next = { name: part, path: built, dirs: new Map(), files: new Map() }
      node.dirs.set(part, next)
    }
    node = next
  }
  return node
}

function insertFile(root: DirBuild, path: string): void {
  const slash = path.lastIndexOf('/')
  const dirPath = slash === -1 ? '' : path.slice(0, slash)
  const name = slash === -1 ? path : path.slice(slash + 1)
  dirOf(root, dirPath).files.set(name, path)
}

function toNode(build: DirBuild, changed: ReadonlyMap<string, ChangeStatus>): TreeDir {
  const dirs = [...build.dirs.values()]
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map(child => toNode(child, changed))
  const files: TreeNode[] = [...build.files.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, path]) => ({ kind: 'file', path, name, status: changed.get(path) }))
  const children = [...dirs, ...files]
  const dirChanged = dirs.reduce((sum, child) => sum + child.changed, 0)
  const fileChanged = files.reduce(
    (sum, file) => sum + (file.kind === 'file' && file.status ? 1 : 0),
    0,
  )
  return {
    kind: 'dir',
    path: build.path,
    name: build.name,
    children,
    changed: dirChanged + fileChanged,
  }
}

/**
 * Builds a tree from repo-relative paths (from `git ls-files --cached --others --exclude-standard
 * -z`), marking changed files and counting changed descendants per dir. Dirs first, then files,
 * each sorted by name. Deleted changed paths absent from `paths` are still added.
 */
export function treeOf(
  paths: readonly string[],
  changed: ReadonlyMap<string, ChangeStatus>,
): TreeDir {
  const root: DirBuild = { name: '', path: '', dirs: new Map(), files: new Map() }
  const seen = new Set(paths)
  for (const path of paths) insertFile(root, path)
  for (const [path, status] of changed) {
    if (status === 'deleted' && !seen.has(path)) insertFile(root, path)
  }
  return toNode(root, changed)
}

/** A visible row of the tree given which dirs are expanded. */
export type TreeRow = { node: TreeNode; depth: number; isExpanded: boolean }

export function rowsOf(root: TreeNode, expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = []
  const walk = (node: TreeNode, depth: number): void => {
    if (node.kind === 'dir' && node.path === '') {
      for (const child of node.children) walk(child, depth)
      return
    }
    const isExpanded = node.kind === 'dir' && expanded.has(node.path)
    rows.push({ node, depth, isExpanded })
    if (node.kind === 'dir' && isExpanded) {
      for (const child of node.children) walk(child, depth + 1)
    }
  }
  walk(root, 0)
  return rows
}

/** Dirs containing a change, so they start expanded. */
export function changedDirsOf(root: TreeNode): Set<string> {
  const dirs = new Set<string>()
  const walk = (node: TreeNode): void => {
    if (node.kind !== 'dir') return
    if (node.changed > 0 && node.path !== '') dirs.add(node.path)
    for (const child of node.children) walk(child)
  }
  walk(root)
  return dirs
}

/** Parses NUL-separated `git ls-files -z` output, capped at `limit` (default 5000) paths. */
export function pathsOf(z: string, limit = 5000): { paths: string[]; isCapped: boolean } {
  const all = z.split('\0').filter(token => token.length > 0)
  const isCapped = all.length > limit
  return { paths: isCapped ? all.slice(0, limit) : all, isCapped }
}

/** Statuses `git ls-files` would need re-running to see: a path appeared, vanished, or moved. */
const LISTING_STATUSES: readonly ChangeStatus[] = ['added', 'deleted', 'untracked', 'renamed']

/** A key over a change set's listing-affecting entries; equal keys mean the same file set. */
export function listingKeyOf(
  files: readonly { path: string; oldPath?: string; status: ChangeStatus }[],
): string {
  return files
    .filter(file => LISTING_STATUSES.includes(file.status))
    .map(file => `${file.status}:${file.path}${file.oldPath ? `<-${file.oldPath}` : ''}`)
    .sort()
    .join('\n')
}

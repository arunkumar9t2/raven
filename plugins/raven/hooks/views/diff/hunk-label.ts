import { type Hunk, parseHeader } from '../../git/hunks'

/** Extensions that are prose: git's function-context heuristic picks a random sentence there. */
const PROSE_EXTENSIONS: ReadonlySet<string> = new Set([
  'md',
  'mdx',
  'markdown',
  'txt',
  'text',
  'rst',
  'adoc',
  'asciidoc',
])

/** Extensions of languages and config formats whose hunks git gives a real function or key header. */
// biome-ignore format: a compact list
const CODE_EXTENSIONS: ReadonlySet<string> = new Set([
  'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'json', 'jsonc', 'kt', 'kts', 'java', 'gradle',
  'py', 'rs', 'go', 'sh', 'bash', 'zsh', 'fish', 'yml', 'yaml', 'toml', 'html', 'htm', 'css',
  'scss', 'sass', 'less', 'swift', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'cs', 'rb', 'php',
  'lua', 'sql', 'xml', 'vue', 'svelte', 'dart', 'scala', 'ex', 'exs', 'hs', 'clj', 'ml', 'r',
  'pl', 'zig', 'nim', 'tf', 'proto', 'graphql', 'gql',
])

/** Whole file names that are code (or build scripts) whatever their extension, or lack of one. */
const CODE_NAMES: ReadonlySet<string> = new Set([
  'dockerfile',
  'makefile',
  'gemfile',
  'rakefile',
  'justfile',
  'jenkinsfile',
  'procfile',
  'cmakelists.txt',
  '.bashrc',
  '.zshrc',
  '.profile',
  '.bash_profile',
])

/**
 * Whether `path` is prose, where the text after `@@` is not worth showing: an explicit prose
 * extension, no extension at all (`README`, `LICENSE`, a dotfile like `.gitignore`), or an
 * extension that is not on the code list. Named build files are code.
 */
export function isProsePath(path: string): boolean {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  if (CODE_NAMES.has(base)) return false
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return true
  const extension = base.slice(dot + 1)
  if (PROSE_EXTENSIONS.has(extension)) return true
  return !CODE_EXTENSIONS.has(extension)
}

/**
 * A hunk's label: its function context and line range (`ƒ handleRequest  L2–8`), or the bare
 * range when git gives no context or the file is prose. The range is the new side's, or the old
 * side's when the new side is empty (a deleted file, a pure deletion). A trailing `{`/`(` off a long suffix is
 * dropped. D10 point 3.
 *
 * The strip is unconditional, not gated on the suffix's length: git only ever puts one context
 * line there, so a trailing brace/paren is always the same kind of artefact (an opening brace a
 * function/block signature got cut on) regardless of how long that line happens to be.
 */
export function hunkLabelOf(hunk: Hunk, path: string): string {
  const parsed = parseHeader(hunk.header)
  if (!parsed) return ''
  // A hunk with nothing on the new side (a deleted file, a pure deletion) has no new lines to
  // name: it reads as the old-side lines it removed.
  const [start, count] =
    parsed.newCount === 0 ? [parsed.oldStart, parsed.oldCount] : [parsed.newStart, parsed.newCount]
  const range = `L${start}–${start + Math.max(0, count - 1)}`
  if (isProsePath(path)) return range
  const suffix = parsed.suffix
    .trim()
    .replace(/[{(]+$/, '')
    .trim()
  return suffix === '' ? range : `ƒ ${suffix}  ${range}`
}

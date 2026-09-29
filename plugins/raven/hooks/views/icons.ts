import { COLORS } from '../core/colors'

type Glyph = { glyph: string; color: string }

const EXT_ICONS: Record<string, Glyph> = {
  ts: { glyph: '\u{e628}', color: '#3178c6' }, // nf-seti-typescript
  tsx: { glyph: '\u{e7ba}', color: '#3178c6' }, // nf-dev-react
  js: { glyph: '\u{e74e}', color: '#f7df1e' }, // nf-dev-javascript
  jsx: { glyph: '\u{e7ba}', color: '#61dafb' }, // nf-dev-react
  mjs: { glyph: '\u{e74e}', color: '#f7df1e' }, // nf-dev-javascript
  cjs: { glyph: '\u{e74e}', color: '#f7df1e' }, // nf-dev-javascript
  json: { glyph: '\u{e60b}', color: '#cbcb41' }, // nf-seti-json
  md: { glyph: '\u{e73e}', color: '#519aba' }, // nf-dev-markdown
  mdx: { glyph: '\u{e73e}', color: '#519aba' }, // nf-dev-markdown
  kt: { glyph: '\u{e634}', color: '#7f52ff' }, // nf-seti-kotlin
  kts: { glyph: '\u{e634}', color: '#7f52ff' }, // nf-seti-kotlin
  java: { glyph: '\u{e738}', color: '#ea2d2e' }, // nf-dev-java
  gradle: { glyph: '\u{e660}', color: '#02303a' }, // nf-seti-gradle
  py: { glyph: '\u{e73c}', color: '#3572a5' }, // nf-dev-python
  rs: { glyph: '\u{e7a8}', color: '#dea584' }, // nf-dev-rust
  go: { glyph: '\u{e627}', color: '#00add8' }, // nf-seti-go
  sh: { glyph: '\u{f489}', color: '#89e051' }, // nf-md-console
  bash: { glyph: '\u{f489}', color: '#89e051' }, // nf-md-console
  zsh: { glyph: '\u{f489}', color: '#89e051' }, // nf-md-console
  yml: { glyph: '\u{e615}', color: '#cb171e' }, // nf-seti-yml
  yaml: { glyph: '\u{e615}', color: '#cb171e' }, // nf-seti-yml
  toml: { glyph: '\u{e615}', color: '#9c4221' }, // nf-seti-yml (toml shares yml family glyph)
  html: { glyph: '\u{e736}', color: '#e34c26' }, // nf-dev-html5
  css: { glyph: '\u{e749}', color: '#563d7c' }, // nf-dev-css3
  scss: { glyph: '\u{e749}', color: '#c6538c' }, // nf-dev-css3
  swift: { glyph: '\u{e755}', color: '#f05138' }, // nf-dev-swift
  c: { glyph: '\u{e61e}', color: '#555555' }, // nf-seti-c
  h: { glyph: '\u{e61e}', color: '#555555' }, // nf-seti-c
  cpp: { glyph: '\u{e61d}', color: '#f34b7d' }, // nf-seti-cpp
  lua: { glyph: '\u{e620}', color: '#000080' }, // nf-seti-lua
  sql: { glyph: '\u{e706}', color: '#dad8d8' }, // nf-dev-database
  xml: { glyph: '\u{e619}', color: '#e37933' }, // nf-seti-xml
  svg: { glyph: '\u{f1c5}', color: '#ffb13b' }, // nf-fa-file_image
  png: { glyph: '\u{f1c5}', color: '#ffb13b' }, // nf-fa-file_image
  jpg: { glyph: '\u{f1c5}', color: '#ffb13b' }, // nf-fa-file_image
  jpeg: { glyph: '\u{f1c5}', color: '#ffb13b' }, // nf-fa-file_image
  gif: { glyph: '\u{f1c5}', color: '#ffb13b' }, // nf-fa-file_image
  lock: { glyph: '\u{f023}', color: '#bbbbbb' }, // nf-fa-lock
}

const NAME_ICONS: Record<string, Glyph> = {
  dockerfile: { glyph: '\u{f308}', color: '#458ee6' }, // nf-md-docker
  makefile: { glyph: '\u{e779}', color: '#e37933' }, // nf-seti-makefile
  '.gitignore': { glyph: '\u{e702}', color: '#f14e32' }, // nf-dev-git
  license: { glyph: '\u{f0219}', color: '#cbcb41' }, // nf-md-certificate
  readme: { glyph: '\u{e73e}', color: '#519aba' }, // nf-dev-markdown
}

const GENERIC_ICON: Glyph = { glyph: '\u{f0214}', color: '#6d8086' } // nf-md-file_outline

const LOCK_SUFFIXES = ['.lock', '-lock.json', '.lockb']

/** A file-type glyph for a path, from Nerd Font (the user's terminal font is a Nerd Font). */
/** The last segment of a slash-separated path. */
export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export function iconOf(path: string): Glyph {
  const base = baseName(path).toLowerCase()
  const nameMatch = NAME_ICONS[base]
  if (nameMatch) return nameMatch

  if (LOCK_SUFFIXES.some(suffix => base.endsWith(suffix))) return EXT_ICONS.lock as Glyph

  const dot = base.lastIndexOf('.')
  if (dot > 0) {
    const ext = base.slice(dot + 1)
    const extMatch = EXT_ICONS[ext]
    if (extMatch) return extMatch
  }

  return GENERIC_ICON
}

const STATUS_MARKS: Record<'added' | 'modified' | 'deleted' | 'renamed' | 'untracked', Glyph> = {
  added: { glyph: 'A', color: COLORS.added },
  modified: { glyph: 'M', color: COLORS.modified },
  deleted: { glyph: 'D', color: COLORS.removed },
  renamed: { glyph: 'R', color: COLORS.suggestion },
  untracked: { glyph: 'U', color: COLORS.added },
}

/** Glyph + color for a change status. */
export function statusMarkOf(
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'untracked',
): Glyph {
  return STATUS_MARKS[status]
}

import { COLORS, RAINBOW } from '../core/colors'
import type { ChangeStatus } from '../git/changes'
import { gap, type KitSeg } from '../ui/strip'

type Glyph = { glyph: string; color: string }

const EXT_ICONS: Record<string, Glyph> = {
  ts: { glyph: '\u{e628}', color: RAINBOW.blue }, // nf-seti-typescript
  tsx: { glyph: '\u{e7ba}', color: RAINBOW.blue }, // nf-dev-react
  js: { glyph: '\u{e74e}', color: RAINBOW.yellow }, // nf-dev-javascript
  jsx: { glyph: '\u{e7ba}', color: RAINBOW.blue }, // nf-dev-react
  mjs: { glyph: '\u{e74e}', color: RAINBOW.yellow }, // nf-dev-javascript
  cjs: { glyph: '\u{e74e}', color: RAINBOW.yellow }, // nf-dev-javascript
  json: { glyph: '\u{e60b}', color: RAINBOW.yellow }, // nf-seti-json
  md: { glyph: '\u{e73e}', color: RAINBOW.indigo }, // nf-dev-markdown
  mdx: { glyph: '\u{e73e}', color: RAINBOW.indigo }, // nf-dev-markdown
  kt: { glyph: '\u{e634}', color: RAINBOW.violet }, // nf-seti-kotlin
  kts: { glyph: '\u{e634}', color: RAINBOW.violet }, // nf-seti-kotlin
  java: { glyph: '\u{e738}', color: RAINBOW.red }, // nf-dev-java
  gradle: { glyph: '\u{e660}', color: RAINBOW.green }, // nf-seti-gradle
  py: { glyph: '\u{e73c}', color: RAINBOW.green }, // nf-dev-python
  rs: { glyph: '\u{e7a8}', color: RAINBOW.orange }, // nf-dev-rust
  go: { glyph: '\u{e627}', color: RAINBOW.blue }, // nf-seti-go
  sh: { glyph: '\u{f489}', color: RAINBOW.green }, // nf-md-console
  bash: { glyph: '\u{f489}', color: RAINBOW.green }, // nf-md-console
  zsh: { glyph: '\u{f489}', color: RAINBOW.green }, // nf-md-console
  yml: { glyph: '\u{e615}', color: RAINBOW.red }, // nf-seti-yml
  yaml: { glyph: '\u{e615}', color: RAINBOW.red }, // nf-seti-yml
  toml: { glyph: '\u{e615}', color: RAINBOW.orange }, // nf-seti-yml (toml shares yml family glyph)
  html: { glyph: '\u{e736}', color: RAINBOW.orange }, // nf-dev-html5
  css: { glyph: '\u{e749}', color: RAINBOW.violet }, // nf-dev-css3
  scss: { glyph: '\u{e749}', color: RAINBOW.violet }, // nf-dev-css3
  swift: { glyph: '\u{e755}', color: RAINBOW.orange }, // nf-dev-swift
  c: { glyph: '\u{e61e}', color: RAINBOW.blue }, // nf-seti-c
  h: { glyph: '\u{e61e}', color: RAINBOW.blue }, // nf-seti-c
  cpp: { glyph: '\u{e61d}', color: RAINBOW.indigo }, // nf-seti-cpp
  lua: { glyph: '\u{e620}', color: RAINBOW.blue }, // nf-seti-lua
  sql: { glyph: '\u{e706}', color: RAINBOW.yellow }, // nf-dev-database
  xml: { glyph: '\u{e619}', color: RAINBOW.orange }, // nf-seti-xml
  svg: { glyph: '\u{f1c5}', color: RAINBOW.violet }, // nf-fa-file_image
  png: { glyph: '\u{f1c5}', color: RAINBOW.violet }, // nf-fa-file_image
  jpg: { glyph: '\u{f1c5}', color: RAINBOW.violet }, // nf-fa-file_image
  jpeg: { glyph: '\u{f1c5}', color: RAINBOW.violet }, // nf-fa-file_image
  gif: { glyph: '\u{f1c5}', color: RAINBOW.violet }, // nf-fa-file_image
  lock: { glyph: '\u{f023}', color: COLORS.subtle }, // nf-fa-lock
}

const NAME_ICONS: Record<string, Glyph> = {
  dockerfile: { glyph: '\u{f308}', color: RAINBOW.blue }, // nf-md-docker
  makefile: { glyph: '\u{e779}', color: RAINBOW.orange }, // nf-seti-makefile
  '.gitignore': { glyph: '\u{e702}', color: RAINBOW.red }, // nf-dev-git
  license: { glyph: '\u{f0219}', color: RAINBOW.yellow }, // nf-md-certificate
  readme: { glyph: '\u{e73e}', color: RAINBOW.indigo }, // nf-dev-markdown
}

const GENERIC_ICON: Glyph = { glyph: '\u{f0214}', color: COLORS.subtle } // nf-md-file_outline

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

const FOLDER_OPEN: Glyph = { glyph: '\u{f0770}', color: RAINBOW.yellow } // nf-md-folder_open
const FOLDER_CLOSED: Glyph = { glyph: '\u{f024b}', color: RAINBOW.yellow } // nf-md-folder

/** The folder glyph of the Files tree, open or closed, in the folder yellow. */
export const folderIconOf = (isOpen: boolean): Glyph => (isOpen ? FOLDER_OPEN : FOLDER_CLOSED)

const STATUS_MARKS: Record<ChangeStatus, Glyph> = {
  added: { glyph: 'A', color: COLORS.added },
  modified: { glyph: 'M', color: COLORS.modified },
  deleted: { glyph: 'D', color: COLORS.removed },
  renamed: { glyph: 'R', color: COLORS.suggestion },
  untracked: { glyph: 'U', color: COLORS.added },
}

/** Glyph + color for a change status. */
export function statusMarkOf(status: ChangeStatus): Glyph {
  return STATUS_MARKS[status]
}

/** A change's status as strip segments: `● M`, both in the status colour. */
export function statusSegs(mark: Glyph): KitSeg[] {
  return [{ t: '●', c: mark.color }, gap(), { t: mark.glyph, c: mark.color }]
}

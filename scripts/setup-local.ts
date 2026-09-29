#!/usr/bin/env bun
/**
 * Loads Raven in every local Claude Code session, live from this checkout, by editing the user's
 * `~/.claude/settings.json`: function hooks on, the plugin folder in `CLAUDE_CODE_PLUGIN_DIRS`, and
 * `Bash(raven:*)` allowed so Claude runs the CLI without a prompt. Idempotent.
 *
 *   bun run setup:local              apply
 *   bun run setup:local --remove     undo
 *   bun run setup:local --dry-run    print the resulting file, change nothing
 *
 * Other entries in `CLAUDE_CODE_PLUGIN_DIRS` and the allow list are kept. A chezmoi-managed settings
 * file needs `chezmoi add ~/.claude/settings.json` afterwards, or the next apply drops the change.
 */
import { homedir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'

const SETTINGS = process.env.CLAUDE_SETTINGS ?? join(homedir(), '.claude', 'settings.json')
const PLUGIN_DIR = resolve(import.meta.dir, '..', 'plugins', 'raven')
const HOOKS_ENV = 'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS'
const DIRS_ENV = 'CLAUDE_CODE_PLUGIN_DIRS'
const ALLOW_RULE = 'Bash(raven:*)'

type Settings = {
  env?: Record<string, string>
  permissions?: { allow?: string[] } & Record<string, unknown>
} & Record<string, unknown>

const isRemove = process.argv.includes('--remove')
const isDryRun = process.argv.includes('--dry-run')

const file = Bun.file(SETTINGS)
const settings: Settings = (await file.exists()) ? await file.json() : {}

const dirsOf = (value: string | undefined) => (value ? value.split(delimiter).filter(Boolean) : [])

function apply(current: Settings): Settings {
  const dirs = dirsOf(current.env?.[DIRS_ENV])
  const allow = current.permissions?.allow ?? []
  return {
    ...current,
    env: {
      ...current.env,
      [HOOKS_ENV]: '1',
      [DIRS_ENV]: [...dirs.filter(dir => dir !== PLUGIN_DIR), PLUGIN_DIR].join(delimiter),
    },
    permissions: {
      ...current.permissions,
      allow: allow.includes(ALLOW_RULE) ? allow : [...allow, ALLOW_RULE],
    },
  }
}

// Function hooks stay on when removing: other mods may rely on them.
function remove(current: Settings): Settings {
  const env = { ...current.env }
  const dirs = dirsOf(env[DIRS_ENV]).filter(dir => dir !== PLUGIN_DIR)
  if (dirs.length > 0) env[DIRS_ENV] = dirs.join(delimiter)
  else delete env[DIRS_ENV]
  const allow = (current.permissions?.allow ?? []).filter(rule => rule !== ALLOW_RULE)
  return { ...current, env, permissions: { ...current.permissions, allow } }
}

const next = isRemove ? remove(settings) : apply(settings)
const text = `${JSON.stringify(next, null, 2)}\n`

if (isDryRun) {
  process.stdout.write(text)
} else if (text === `${JSON.stringify(settings, null, 2)}\n`) {
  console.log(`${SETTINGS} already ${isRemove ? 'has no Raven entries' : 'loads Raven'}`)
} else {
  await Bun.write(SETTINGS, text)
  console.log(`${isRemove ? 'Removed Raven from' : 'Raven now loads from'} ${SETTINGS}`)
  console.log('Start a new Claude Code session to pick it up.')
}

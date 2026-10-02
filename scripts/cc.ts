#!/usr/bin/env bun
// Drives an interactive Claude Code session in tmux with the Raven plugin loaded (through
// --settings or CLAUDE_CODE_PLUGIN_DIRS passed explicitly; see scripts/setup-local.ts for the
// persistent version), so the mod can be exercised and its pane captured without a human at the
// keyboard. File checkpointing is off so the built-in diff panel does not auto-open over Raven's
// panes. The caller's own CLAUDE_CODE_*/CLAUDECODE*/CLAUDE_PLUGIN_* environment, plus a handful of
// unprefixed parent-session markers (CLAUDE_PID, CLAUDE_EFFORT, CLAUDE_ENV_FILE,
// CLAUDE_PROJECT_DIR, AI_AGENT), is scrubbed before the session starts, so running this from
// inside a Claude Code session never leaks that session's plugin dirs or markers into the one it
// launches. CLAUDE_CONFIG_DIR is a user choice, not a session marker, and passes through.
//
//   scripts/cc.ts start [workdir]          launch (default workdir: a throwaway git repo)
//   scripts/cc.ts type <text>              type text into the composer and press Enter
//   scripts/cc.ts keys <key>...            send raw tmux keys (Enter, Escape, Down, C-c …)
//   scripts/cc.ts click <col> <row>        left-click at 1-based screen cell (SGR mouse)
//   scripts/cc.ts hover <col> <row>        move the pointer to a 1-based screen cell, no click
//   scripts/cc.ts wheel <col> <row> up|down   scroll wheel tick at 1-based screen cell (SGR mouse)
//   scripts/cc.ts cap                      print the visible screen
//   scripts/cc.ts stop                     kill the session
//
// Env knobs: RAVEN_TMUX_SESSION, RAVEN_SANDBOX, RAVEN_COLS, RAVEN_ROWS, RAVEN_CLAUDE_ARGS.

const USAGE = `
  scripts/cc.ts start [workdir]          launch (default workdir: a throwaway git repo)
  scripts/cc.ts type <text>              type text into the composer and press Enter
  scripts/cc.ts keys <key>...            send raw tmux keys (Enter, Escape, Down, C-c …)
  scripts/cc.ts click <col> <row>        left-click at 1-based screen cell (SGR mouse)
  scripts/cc.ts hover <col> <row>        move the pointer to a 1-based screen cell, no click
  scripts/cc.ts wheel <col> <row> up|down   scroll wheel tick at 1-based screen cell (SGR mouse)
  scripts/cc.ts cap                      print the visible screen
  scripts/cc.ts stop                     kill the session
`

/** The pane's own env: what every run sets regardless of what the caller's env held. */
export const HARNESS_ENV = {
  CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: '1',
  CLAUDE_CODE_NO_FLICKER: '1',
  CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING: '1',
} as const

// Prefixes cover a whole family of names (CLAUDE_CODE_PLUGIN_DIRS, CLAUDECODE,
// CLAUDE_PLUGIN_DATA/_ROOT, …); exact names catch markers that don't share either prefix but are
// still a parent Claude session's own, not the caller's business to pass down (R34).
// CLAUDE_CONFIG_DIR is a user choice, not a session marker, and is deliberately left out — it
// passes through untouched.
const SCRUB_PREFIXES = ['CLAUDE_CODE_', 'CLAUDECODE', 'CLAUDE_PLUGIN_']
const SCRUB_EXACT_NAMES = new Set([
  'CLAUDE_PID',
  'CLAUDE_EFFORT',
  'CLAUDE_ENV_FILE',
  'CLAUDE_PROJECT_DIR',
  'AI_AGENT',
])

function isScrubbedName(name: string): boolean {
  return SCRUB_PREFIXES.some(prefix => name.startsWith(prefix)) || SCRUB_EXACT_NAMES.has(name)
}

/**
 * Drops every CLAUDE_CODE_/CLAUDECODE/CLAUDE_PLUGIN_ name, every exact marker in
 * SCRUB_EXACT_NAMES, and any undefined value; keeps the rest as-is (including CLAUDE_CONFIG_DIR).
 */
export function scrubEnv(env: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined || isScrubbedName(key)) continue
    out[key] = value
  }
  return out
}

// What `env -u NAME` can take as a bare, unquoted shell word in buildPaneCommand's command
// string. A name with a space or a shell metacharacter (e.g. `;`) would either break the `env`
// invocation or inject another command, so any such name is dropped rather than passed through —
// it can't be a real POSIX environment variable name anyway.
const IDENTIFIER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * The full set of names the pane command must `-u` to be clean: every scrubbed name in the
 * caller's own env, unioned with `extraNames` (the matching names already held in a tmux server's
 * global environment, when one is already running from an earlier, unscrubbed launch). Only
 * identifier-safe names reach the result; anything else is dropped before it could reach the
 * `env -u …` shell string.
 */
export function scrubNames(
  callerEnv: Record<string, string | undefined>,
  extraNames: string[] = [],
): string[] {
  const names = new Set<string>()
  for (const key of Object.keys(callerEnv)) {
    if (isScrubbedName(key)) names.add(key)
  }
  for (const key of extraNames) {
    if (isScrubbedName(key)) names.add(key)
  }
  return [...names].filter(name => IDENTIFIER_NAME.test(name)).sort()
}

/**
 * The shell command tmux runs in the pane: `env` unsets every scrubbed name (covering both the
 * caller's own env and anything already sitting in a live tmux server's global env), sets the
 * harness's own vars, then execs `claude` with RAVEN_CLAUDE_ARGS appended unparsed, exactly as
 * `cc.sh` interpolated it into its quoted command string.
 */
export function buildPaneCommand(opts: { scrubNames: string[]; claudeArgs: string }): string {
  const unsets = opts.scrubNames.map(name => `-u ${name}`)
  const harness = Object.entries(HARNESS_ENV).map(([key, value]) => `${key}=${value}`)
  const parts = ['env', ...unsets, ...harness, 'claude']
  const command = parts.join(' ')
  return opts.claudeArgs ? `${command} ${opts.claudeArgs}` : command
}

export function newSessionArgv(opts: {
  session: string
  cols: number
  rows: number
  cwd: string
  paneCommand: string
}): string[] {
  return [
    'tmux',
    'new-session',
    '-d',
    '-s',
    opts.session,
    '-x',
    String(opts.cols),
    '-y',
    String(opts.rows),
    '-c',
    opts.cwd,
    opts.paneCommand,
  ]
}

/** `cat -s` after `sed -e 's/[[:space:]]*$//'`: trim trailing whitespace, squeeze blank runs. */
export function squeezeCapture(raw: string): string {
  const lines = raw.split('\n').map(line => line.replace(/[ \t]+$/, ''))
  const out: string[] = []
  let lastWasBlank = false
  for (const line of lines) {
    const isBlank = line === ''
    if (isBlank && lastWasBlank) continue
    out.push(line)
    lastWasBlank = isBlank
  }
  return out.join('\n')
}

export type Command =
  | { cmd: 'start'; workdir?: string }
  | { cmd: 'type'; text: string }
  | { cmd: 'keys'; keys: string[] }
  | { cmd: 'click'; col: number; row: number }
  | { cmd: 'hover'; col: number; row: number }
  | { cmd: 'wheel'; col: number; row: number; dir: 'up' | 'down' }
  | { cmd: 'cap' }
  | { cmd: 'stop' }

export type ParseResult =
  | { ok: true; command: Command }
  | { ok: false; message: string; code: number }

function parseCoord(raw: string | undefined, label: string): number | null {
  if (raw === undefined || !/^-?\d+$/.test(raw)) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  void label
  return n
}

function err(message: string, code = 1): ParseResult {
  return { ok: false, message, code }
}

export function parse(argv: string[]): ParseResult {
  const [command, ...rest] = argv
  switch (command) {
    case 'start':
      return { ok: true, command: { cmd: 'start', ...(rest[0] ? { workdir: rest[0] } : {}) } }

    case 'type': {
      const text = rest.join(' ')
      if (text.trim() === '/raven') {
        return err(
          'cc.ts type: refusing a bare "/raven" — the composer\'s typeahead can complete it to ' +
            'the /raven:preview skill and start a model turn. Type a full subcommand, e.g. ' +
            '"/raven diff".',
          2,
        )
      }
      return { ok: true, command: { cmd: 'type', text } }
    }

    case 'keys':
      if (rest.length === 0) return err('cc.ts keys: missing <key>...')
      return { ok: true, command: { cmd: 'keys', keys: rest } }

    case 'click': {
      const col = parseCoord(rest[0], 'col')
      const row = parseCoord(rest[1], 'row')
      if (col === null || row === null) return err('cc.ts click: <col> <row> must be integers')
      return { ok: true, command: { cmd: 'click', col, row } }
    }

    case 'hover': {
      const col = parseCoord(rest[0], 'col')
      const row = parseCoord(rest[1], 'row')
      if (col === null || row === null) return err('cc.ts hover: <col> <row> must be integers')
      return { ok: true, command: { cmd: 'hover', col, row } }
    }

    case 'wheel': {
      const col = parseCoord(rest[0], 'col')
      const row = parseCoord(rest[1], 'row')
      const dir = rest[2]
      if (col === null || row === null) return err('cc.ts wheel: <col> <row> must be integers')
      if (dir !== 'up' && dir !== 'down') return err('cc.ts wheel: direction must be up|down')
      return { ok: true, command: { cmd: 'wheel', col, row, dir } }
    }

    case 'cap':
      return { ok: true, command: { cmd: 'cap' } }

    case 'stop':
      return { ok: true, command: { cmd: 'stop' } }

    default:
      return err(`cc.ts: unknown command ${JSON.stringify(command ?? '')}\n${USAGE}`)
  }
}

// ---------------------------------------------------------------------------------------------
// Everything below runs the real thing; none of it is exercised by the unit tests above, which
// import only the pure functions. Guarded so importing this file for tests never spawns tmux.

function run(
  argv: string[],
  opts: { input?: string; env?: Record<string, string>; quiet?: boolean } = {},
  cwd?: string,
): { code: number; stdout: string } {
  const result = Bun.spawnSync(argv, {
    stdin: opts.input ? Buffer.from(opts.input) : undefined,
    stderr: opts.quiet ? 'ignore' : 'inherit',
    ...(opts.env ? { env: opts.env } : {}),
    ...(cwd ? { cwd } : {}),
  })
  return { code: result.exitCode, stdout: result.stdout.toString('utf8') }
}

function readTmuxGlobalEnvNames(): string[] {
  const result = Bun.spawnSync(['tmux', 'show-environment', '-g'])
  if (result.exitCode !== 0) return []
  const names: string[] = []
  for (const line of result.stdout.toString('utf8').split('\n')) {
    const match = /^-?([A-Za-z_][A-Za-z0-9_]*)/.exec(line)
    if (match?.[1]) names.push(match[1])
  }
  return names
}

async function createSandbox(dir: string): Promise<number> {
  run(['rm', '-rf', dir])
  run(['mkdir', '-p', dir])
  await Bun.write(`${dir}/a.txt`, 'hello\nold line\n')
  run(['git', 'init', '-q'], undefined, dir)
  const added = run(['git', 'add', '-A'], undefined, dir)
  if (added.code !== 0) return added.code
  const committed = run(
    ['git', '-c', 'user.email=raven@local', '-c', 'user.name=raven', 'commit', '-qm', 'init'],
    undefined,
    dir,
  )
  if (committed.code !== 0) return committed.code
  await Bun.write(`${dir}/a.txt`, 'hello\nnew line\n')
  return 0
}

async function main(): Promise<number> {
  const parsed = parse(process.argv.slice(2))
  if (!parsed.ok) {
    process.stderr.write(`${parsed.message}\n`)
    return parsed.code
  }

  const session = process.env.RAVEN_TMUX_SESSION || 'raven-e2e'
  const { command } = parsed

  switch (command.cmd) {
    case 'start': {
      const sandbox = process.env.RAVEN_SANDBOX || '/tmp/raven-sandbox'
      let workdir = command.workdir
      if (!workdir) {
        const sandboxCode = await createSandbox(sandbox)
        if (sandboxCode !== 0) return sandboxCode
        workdir = sandbox
      }
      // ignored, and quiet: cc.sh's own pre-start cleanup was `|| true` with no "session not
      // found" noise on a clean start
      run(['tmux', 'kill-session', '-t', session], { quiet: true })

      const globalNames = readTmuxGlobalEnvNames()
      const names = scrubNames(process.env, globalNames)
      const paneCommand = buildPaneCommand({
        scrubNames: names,
        claudeArgs: process.env.RAVEN_CLAUDE_ARGS || '',
      })
      const cols = Number(process.env.RAVEN_COLS || '200')
      const rows = Number(process.env.RAVEN_ROWS || '50')
      const argv = newSessionArgv({ session, cols, rows, cwd: workdir, paneCommand })

      const spawnEnv = scrubEnv(process.env)
      const started = run(argv, { env: spawnEnv })
      if (started.code !== 0) return started.code

      await Bun.sleep(5000)
      const capture = run(['tmux', 'capture-pane', '-t', session, '-p']).stdout
      if (capture.includes('trust this folder')) {
        run(['tmux', 'send-keys', '-t', session, 'Down'])
        await Bun.sleep(300)
        run(['tmux', 'send-keys', '-t', session, 'Enter'])
        await Bun.sleep(4000)
      }
      return 0
    }

    case 'type': {
      const typed = run(['tmux', 'send-keys', '-t', session, '-l', command.text])
      if (typed.code !== 0) return typed.code
      await Bun.sleep(500)
      return run(['tmux', 'send-keys', '-t', session, 'Enter']).code
    }

    case 'keys':
      return run(['tmux', 'send-keys', '-t', session, ...command.keys]).code

    case 'click': {
      const pressed = run([
        'tmux',
        'send-keys',
        '-t',
        session,
        '-l',
        `\x1b[<0;${command.col};${command.row}M`,
      ])
      if (pressed.code !== 0) return pressed.code
      await Bun.sleep(100)
      return run([
        'tmux',
        'send-keys',
        '-t',
        session,
        '-l',
        `\x1b[<0;${command.col};${command.row}m`,
      ]).code
    }

    case 'hover':
      return run([
        'tmux',
        'send-keys',
        '-t',
        session,
        '-l',
        `\x1b[<35;${command.col};${command.row}M`,
      ]).code

    case 'wheel': {
      const button = command.dir === 'up' ? 64 : 65
      return run([
        'tmux',
        'send-keys',
        '-t',
        session,
        '-l',
        `\x1b[<${button};${command.col};${command.row}M`,
      ]).code
    }

    case 'cap': {
      const captured = run(['tmux', 'capture-pane', '-t', session, '-p'])
      if (captured.code !== 0) return captured.code
      process.stdout.write(`${squeezeCapture(captured.stdout)}\n`)
      return 0
    }

    case 'stop':
      // ignored, and quiet: cc.sh's own `stop` was `|| true` with no "session not found" noise
      run(['tmux', 'kill-session', '-t', session], { quiet: true })
      return 0
  }
}

if (import.meta.main) {
  process.exit(await main())
}

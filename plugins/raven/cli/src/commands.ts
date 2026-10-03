import { isAbsolute, resolve } from 'node:path'
import type { Directive } from '../../hooks/core/directive'
import { directiveLine } from './directive'
import { FALLBACK_PREFIX, NAME, PANE_SUBCOMMANDS, type PaneSubcommand, VERSION } from './names'

/** The process-shaped bits the commands need, isolated so tests can inject fakes. */
export type Io = {
  cwd: string
  stdout(s: string): void
  stderr(s: string): void
  readStdin(): Promise<string>
  exists(path: string): Promise<'file' | 'dir' | null>
}

const FALLBACK_HINT =
  '(If your Claude Code is older than 2.1.287, enable function hooks: CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1)'

const USAGE = `Usage: ${NAME} <command> [options]

Commands:
  show <path> [--title <t>]          Open the doc view on a file
  note [--title <t>] [<markdown>]    Open the doc view on inline markdown (stdin when omitted or "-")
  diff [<path>]                      Open the diff view, optionally selecting a file
  open <pane>                        Open a pane: diff|doc|files|tasks
  comments                           Ask the pane for pending review comments
  help                               Show this message

Run "${NAME} --version" to print the version.
`

/** Prints the directive, then what the reader sees when no mod consumed it. */
function emit(io: Io, directive: Directive, fallback: string): number {
  io.stdout(`${directiveLine(directive)}\n`)
  io.stdout(`${FALLBACK_PREFIX} ${fallback} ${FALLBACK_HINT}\n`)
  return 0
}

function resolvePath(io: Io, path: string): string {
  return isAbsolute(path) ? path : resolve(io.cwd, path)
}

/** Splits `--title <value>`, wherever it appears, from the remaining positional args. */
function extractTitle(args: string[]): { title?: string; rest: string[] } {
  const rest: string[] = []
  let title: string | undefined
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--title') {
      title = args[i + 1]
      i++
    } else if (arg !== undefined) {
      rest.push(arg)
    }
  }
  return { title, rest }
}

async function runShow(args: string[], io: Io): Promise<number> {
  const { title, rest } = extractTitle(args)
  const raw = rest[0]
  if (!raw) {
    io.stderr(`${NAME} show: missing <path>\n`)
    return 1
  }
  const path = resolvePath(io, raw)
  const kind = await io.exists(path)
  if (kind !== 'file') {
    io.stderr(`${NAME} show: ${path} ${kind === 'dir' ? 'is a directory' : 'does not exist'}\n`)
    return 1
  }
  return emit(io, { op: 'show', path, ...(title ? { title } : {}) }, `${path} was not shown.`)
}

async function runNote(args: string[], io: Io): Promise<number> {
  const { title, rest } = extractTitle(args)
  const arg = rest[0]
  const markdown = (arg === undefined || arg === '-' ? await io.readStdin() : arg).trim()
  if (!markdown) {
    io.stderr(`${NAME} note: empty markdown\n`)
    return 1
  }
  return emit(io, { op: 'note', markdown, ...(title ? { title } : {}) }, 'the note was not shown.')
}

async function runDiff(args: string[], io: Io): Promise<number> {
  const raw = args[0]
  const path = raw ? resolvePath(io, raw) : undefined
  return emit(io, { op: 'diff', ...(path ? { path } : {}) }, 'the diff was not shown.')
}

async function runComments(io: Io): Promise<number> {
  return emit(io, { op: 'comments' }, 'there are no pending comments.')
}

async function runOpen(args: string[], io: Io): Promise<number> {
  const pane = args[0]
  if (!PANE_SUBCOMMANDS.includes(pane as PaneSubcommand)) {
    io.stderr(
      `${NAME} open: ${pane ? `unknown pane "${pane}"` : 'missing <pane>'} (one of ${PANE_SUBCOMMANDS.join('|')})\n`,
    )
    return 1
  }
  return emit(io, { op: 'open', pane: pane as PaneSubcommand }, `the ${pane} pane was not shown.`)
}

/** Entry point shared by the real binary and tests; `argv` excludes the interpreter and script. */
export async function run(argv: string[], io: Io): Promise<number> {
  const [command, ...rest] = argv

  if (command === undefined || command === 'help' || command === '--help') {
    io.stdout(USAGE)
    return 0
  }
  if (command === '--version') {
    io.stdout(`${VERSION}\n`)
    return 0
  }

  switch (command) {
    case 'show':
      return runShow(rest, io)
    case 'note':
      return runNote(rest, io)
    case 'diff':
      return runDiff(rest, io)
    case 'open':
      return runOpen(rest, io)
    case 'comments':
      return runComments(io)
    default:
      io.stderr(`${NAME}: unknown command "${command}"\n\n${USAGE}`)
      return 2
  }
}

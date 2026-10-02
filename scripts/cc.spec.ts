import { describe, expect, test } from 'bun:test'
import {
  buildPaneCommand,
  HARNESS_ENV,
  newSessionArgv,
  parse,
  scrubEnv,
  scrubNames,
  squeezeCapture,
} from './cc'

describe('parse', () => {
  test('start with no workdir', () => {
    expect(parse(['start'])).toEqual({ ok: true, command: { cmd: 'start' } })
  })

  test('start with a workdir', () => {
    expect(parse(['start', '/tmp/foo'])).toEqual({
      ok: true,
      command: { cmd: 'start', workdir: '/tmp/foo' },
    })
  })

  test('type joins the remaining args like "$*"', () => {
    expect(parse(['type', '/raven', 'diff'])).toEqual({
      ok: true,
      command: { cmd: 'type', text: '/raven diff' },
    })
  })

  test('type refuses exactly a bare /raven, trimmed', () => {
    const result = parse(['type', '/raven'])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe(2)
      expect(result.message).toContain('/raven diff')
    }
  })

  test('type refuses a bare /raven even with surrounding whitespace', () => {
    const result = parse(['type', ' /raven ', ''])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe(2)
  })

  test('type allows /raven with a subcommand', () => {
    expect(parse(['type', '/raven', 'files'])).toEqual({
      ok: true,
      command: { cmd: 'type', text: '/raven files' },
    })
  })

  test('keys passes through raw tmux key names', () => {
    expect(parse(['keys', 'Enter', 'Escape'])).toEqual({
      ok: true,
      command: { cmd: 'keys', keys: ['Enter', 'Escape'] },
    })
  })

  test('click parses 1-based col/row', () => {
    expect(parse(['click', '10', '20'])).toEqual({
      ok: true,
      command: { cmd: 'click', col: 10, row: 20 },
    })
  })

  test('click rejects non-numeric coordinates', () => {
    const result = parse(['click', 'x', '20'])
    expect(result.ok).toBe(false)
  })

  test('wheel parses col/row/direction', () => {
    expect(parse(['wheel', '5', '6', 'up'])).toEqual({
      ok: true,
      command: { cmd: 'wheel', col: 5, row: 6, dir: 'up' },
    })
  })

  test('wheel rejects a bad direction', () => {
    const result = parse(['wheel', '5', '6', 'sideways'])
    expect(result.ok).toBe(false)
  })

  test('hover parses col/row', () => {
    expect(parse(['hover', '5', '6'])).toEqual({
      ok: true,
      command: { cmd: 'hover', col: 5, row: 6 },
    })
  })

  test('cap and stop take no arguments', () => {
    expect(parse(['cap'])).toEqual({ ok: true, command: { cmd: 'cap' } })
    expect(parse(['stop'])).toEqual({ ok: true, command: { cmd: 'stop' } })
  })

  test('an unknown command is rejected', () => {
    const result = parse(['frobnicate'])
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe(1)
  })

  test('no command at all is rejected', () => {
    const result = parse([])
    expect(result.ok).toBe(false)
  })
})

describe('scrubEnv', () => {
  test('drops every CLAUDE_CODE_* and CLAUDECODE* name, keeps everything else', () => {
    const scrubbed = scrubEnv({
      CLAUDE_CODE_PLUGIN_DIRS: '/somewhere/else',
      CLAUDE_CODE_ENTRYPOINT: 'cli',
      CLAUDECODE: '1',
      PATH: '/usr/bin',
      HOME: '/home/x',
      ANTHROPIC_API_KEY: 'secret',
    })
    expect(scrubbed).toEqual({
      PATH: '/usr/bin',
      HOME: '/home/x',
      ANTHROPIC_API_KEY: 'secret',
    })
  })

  test('drops undefined values', () => {
    expect(scrubEnv({ PATH: undefined, HOME: '/home/x' })).toEqual({ HOME: '/home/x' })
  })
})

describe('scrubNames', () => {
  test('collects matching names from the caller env and extra (e.g. tmux global) names', () => {
    const names = scrubNames({ CLAUDE_CODE_PLUGIN_DIRS: '/x', CLAUDECODE: '1', PATH: '/usr/bin' }, [
      'CLAUDE_CODE_ENTRYPOINT',
      'OTHER',
    ])
    expect(names).toEqual(['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_PLUGIN_DIRS'])
  })
})

describe('buildPaneCommand', () => {
  test('unsets every scrubbed name, sets the harness vars, then runs claude', () => {
    const cmd = buildPaneCommand({
      scrubNames: ['CLAUDECODE', 'CLAUDE_CODE_PLUGIN_DIRS'],
      claudeArgs: '',
    })
    expect(cmd).toBe(
      'env -u CLAUDECODE -u CLAUDE_CODE_PLUGIN_DIRS ' +
        'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 CLAUDE_CODE_NO_FLICKER=1 ' +
        'CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING=1 claude',
    )
  })

  test('appends RAVEN_CLAUDE_ARGS unparsed', () => {
    const cmd = buildPaneCommand({
      scrubNames: [],
      claudeArgs: "--settings /x/worktree-settings.json --allowedTools 'Bash(raven:*)' Write",
    })
    expect(cmd).toBe(
      `env ${Object.entries(HARNESS_ENV)
        .map(([k, v]) => `${k}=${v}`)
        .join(
          ' ',
        )} claude --settings /x/worktree-settings.json --allowedTools 'Bash(raven:*)' Write`,
    )
  })
})

describe('newSessionArgv', () => {
  test('matches the shape of the bash tmux new-session invocation', () => {
    expect(
      newSessionArgv({
        session: 'raven-e2e',
        cols: 200,
        rows: 50,
        cwd: '/tmp/raven-sandbox',
        paneCommand: 'claude',
      }),
    ).toEqual([
      'tmux',
      'new-session',
      '-d',
      '-s',
      'raven-e2e',
      '-x',
      '200',
      '-y',
      '50',
      '-c',
      '/tmp/raven-sandbox',
      'claude',
    ])
  })
})

describe('squeezeCapture', () => {
  test('trims trailing whitespace on each line and squeezes repeated blank lines', () => {
    const raw = 'a   \nb\t\n\n\n\nc\n'
    expect(squeezeCapture(raw)).toBe('a\nb\n\nc\n')
  })
})

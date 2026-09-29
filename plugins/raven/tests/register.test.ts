import type { CommandRunInput, On, TurnCompleteInput } from 'claude-code'
import { describe, type Engine, expect, mock, test, tier } from 'claude-code/testing'
import { commentsStoreKeyOf, DIFF_PANE, NAME, toolNameOf } from '../hooks/names'

tier('user')

const TOOL = toolNameOf(NAME)

const SESSION = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
const FALLBACK = 'Raven pane is not active; x was not shown. (Enable function hooks)'

const ravenCommand = (args: string): CommandRunInput => ({
  command: 'raven',
  args,
  origin: { kind: 'composer' },
  presentation: { isFullscreen: true, columns: 160 },
})

/** A world outside any git repository, whose Bash calls print `stdout`. */
function world(on: On, stdout: string) {
  mock.clock(on)
  mock.store(on, {})
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__${$.plugin.name}__${e.name}` } }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'not a repo' } }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout, stderr: '', interrupted: false } }))

  const shown = new Set<string>()
  on('ui.open', ($, e) => {
    shown.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    shown.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...shown].map(id => ({
      id,
      title: id,
      isShown: true,
      isFocused: false,
      isPlaced: true,
    })),
  }))
  on('ui.focus', () => ({}))
}

describe('register', () => {
  test('a directive and its fallback give way to the ack', async ($, on) => {
    world(on, `::raven::{"op":"comments"}\n${FALLBACK}\n`)

    await $.session.start(SESSION)
    const result = await $.tool.call({ tool: 'Bash', command: 'raven comments' })

    expect(result.text).toBe('The user has no pending review comments.')
    expect(result.result).toMatchObject({ stdout: 'The user has no pending review comments.' })
  })

  test('the rest of a command that also printed a directive is kept', async ($, on) => {
    world(on, `building\n::raven::{"op":"comments"}\n${FALLBACK}\ntests passed\n`)

    await $.session.start(SESSION)
    const result = await $.tool.call({ tool: 'Bash', command: 'make && raven comments' })

    expect(result.text).toBe('building\ntests passed\nThe user has no pending review comments.')
  })

  test('a Bash call without a directive keeps its result', async ($, on) => {
    world(on, 'hello\n')

    await $.session.start(SESSION)
    const result = await $.tool.call({ tool: 'Bash', command: 'echo hello' })

    expect(result.result).toMatchObject({ stdout: 'hello\n' })
  })

  test('the show tool answers a comments call with no pending comments', async ($, on) => {
    world(on, '')

    await $.session.start(SESSION)
    const result = await $.tool.call({ tool: TOOL, op: 'comments' })

    expect(result.text).toBe('The user has no pending review comments.')
  })

  test('the show tool refuses input its schema does not describe', async ($, on) => {
    world(on, '')

    await $.session.start(SESSION)
    const result = await $.tool.call({ tool: TOOL, op: 'nonsense' })

    expect(result.deny).toBeDefined()
  })

  test('a TodoWrite call surfaces in the tasks view', async ($, on) => {
    world(on, '')
    on('tool.call', { tool: 'TodoWrite' }, () => ({ result: {} }))

    await $.session.start(SESSION)
    // With no Raven pane open, TodoWrite would auto-open Tasks itself; open Doc first so the
    // explicit `/raven tasks` below is the one that shows it.
    expect((await $.command.run(ravenCommand('doc'))).text).toBe('Raven doc shown')

    const todo = await $.tool.call({
      tool: 'TodoWrite',
      todos: [{ content: 'write tests', status: 'pending' }],
    })
    expect(todo.deny).toBeUndefined()

    const result = await $.command.run(ravenCommand('tasks'))
    expect(result.text).toBe('Raven tasks shown')
  })
})

const REPO = '/work'
const USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
}

const mainLoopTurn = (answer: string): TurnCompleteInput => ({
  answer,
  durationMs: 1,
  isAborted: false,
  turnId: 't1',
  reason: 'answer',
})

const PANE_PROPS = {
  title: 'Diff',
  isFocused: false,
  bodyColumns: 100,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

const mountDiff = ($: Engine) =>
  $.ui.mount({
    plugin: NAME,
    surface: 'terminal',
    component: 'Pane',
    props: PANE_PROPS,
    requestId: DIFF_PANE.id,
  })

/**
 * A world inside a git repository with modified files (`a.ts` by default, no hunks), so a
 * file-level comment on one draws without needing a hunk fixture; `review.load` runs against a
 * real toplevel.
 */
function gitWorld(
  on: On,
  storeEntries: Record<string, unknown>,
  forkText: string | null,
  files: readonly string[] = ['a.ts'],
) {
  mock.clock(on)
  mock.store(on, storeEntries)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__${$.plugin.name}__${e.name}` } }))
  on('process.run', ($, e) => {
    const [cmd, sub] = e.argv
    if (cmd === 'git' && sub === 'rev-parse') {
      return { value: { exitCode: 0, stdout: REPO, stderr: '' } }
    }
    if (cmd === 'git' && sub === 'status') {
      const stdout = files.map(path => ` M ${path}\0`).join('')
      return { value: { exitCode: 0, stdout, stderr: '' } }
    }
    if (cmd === 'git' && e.argv.includes('--numstat')) {
      const stdout = files.map(path => `1\t1\t${path}\0`).join('')
      return { value: { exitCode: 0, stdout, stderr: '' } }
    }
    // loadHunks: no hunks, which is fine for a file-level comment.
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('model.fork', () => ({
    value:
      forkText === null
        ? { isAnswered: false, reason: 'nothing-to-fork' }
        : { isAnswered: true, text: forkText, usage: USAGE },
  }))
  on('turn.complete', ($, e) => ({ text: e.answer }))

  const shown = new Set<string>()
  on('ui.open', ($, e) => {
    shown.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    shown.delete(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: [...shown].map(id => ({
      id,
      title: id,
      isShown: true,
      isFocused: false,
      isPlaced: true,
    })),
  }))
  on('ui.focus', () => ({}))
}

describe('diff view keyboard control', () => {
  test('pressing the next-file button moves the selection to the next file', async ($, on) => {
    gitWorld(on, {}, null, ['a.ts', 'b.ts'])

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    expect((await ui.find({ key: 'row:a.ts' }))?.text).toContain('❯')
    expect((await ui.find({ key: 'row:b.ts' }))?.text).not.toContain('❯')

    await ui.press({ key: 'next' })

    expect((await ui.find({ key: 'row:a.ts' }))?.text).not.toContain('❯')
    expect((await ui.find({ key: 'row:b.ts' }))?.text).toContain('❯')
  })
})

describe('turn.complete resolves sent comments', () => {
  test('a mocked fork naming the id moves a sent comment to addressed', async ($, on) => {
    const sent = { id: 'c1', path: 'a.ts', text: 'fix this', status: 'sent', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [sent] }, '["c1"]')

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.turn.complete(mainLoopTurn('done'))

    const ui = await mountDiff($)
    expect(await ui.find({ text: /1 addressed/ })).toBeDefined()
    expect(await ui.find({ text: 'fix this' })).toBeUndefined()
  })

  test('a null fork reply leaves the comment sent', async ($, on) => {
    const sent = { id: 'c2', path: 'a.ts', text: 'fix this', status: 'sent', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [sent] }, null)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.turn.complete(mainLoopTurn('done'))

    const ui = await mountDiff($)
    expect(await ui.find({ text: /addressed/ })).toBeUndefined()
    expect(await ui.find({ text: /fix this/ })).toBeDefined()
  })

  test('an agent turn does not fork', async ($, on) => {
    const sent = { id: 'c3', path: 'a.ts', text: 'fix this', status: 'sent', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [sent] }, '["c3"]')

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.turn.complete({ ...mainLoopTurn('done'), agentId: 'sub-1' })

    const ui = await mountDiff($)
    expect(await ui.find({ text: /addressed/ })).toBeUndefined()
    expect(await ui.find({ text: /fix this/ })).toBeDefined()
  })
})

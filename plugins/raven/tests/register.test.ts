import type { On, SessionMessage, TurnCompleteInput } from 'claude-code'
import { describe, type Engine, expect, mock, test, tier } from 'claude-code/testing'
import { commentsStoreKeyOf, DIFF_PANE, DOC_PANE, NAME, toolNameOf } from '../hooks/names'
import { stageKeyOf } from '../hooks/views/diff/anchor'
import { SOURCE_SELECT_KEY } from '../hooks/views/diff/header'
import { turnValueOf } from '../hooks/views/diff/source'
import { baseWorld, PANE_PROPS, REPO, ran, ravenCommand, SESSION, trackShownPanes } from './helpers'

tier('user')

const TOOL = toolNameOf(NAME)

const FALLBACK = 'Raven pane is not active; x was not shown. (Enable function hooks)'

/** A world outside any git repository, whose Bash calls print `stdout`. */
function world(on: On, stdout: string, env: Readonly<Record<string, string>> = {}) {
  baseWorld(on)
  mock.env(on, env)
  on('process.run', () => ran(128, '', 'not a repo'))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('settings.read', () => ({ value: {} }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout, stderr: '', interrupted: false } }))

  trackShownPanes(on)
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

/**
 * A world like `world`'s, but recording every pane opened rather than just the ones currently
 * shown, so a test can tell an auto-open happened from one that never did.
 */
function openWorld(on: On) {
  const opened: string[] = []
  baseWorld(on)
  on('process.run', () => ran(128, '', 'not a repo'))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('settings.read', () => ({ value: {} }))
  on('ui.open', ($, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.focus', () => ({}))
  on('tool.call', { tool: 'Edit' }, () => ({ result: {} }))
  return opened
}

const editOf = (path: string) => ({
  tool: 'Edit',
  file_path: path,
  old_string: 'a',
  new_string: 'b',
})

describe('options: main-loop-edit auto-open, defaults', () => {
  test('the first main-loop edit auto-opens the diff pane', async ($, on) => {
    const opened = openWorld(on)

    await $.session.start(SESSION)
    await $.tool.call(editOf('/work/a.ts'))

    expect(opened).toContain(DIFF_PANE.id)
  })

  test('a second main-loop edit does not reopen it', async ($, on) => {
    const opened = openWorld(on)

    await $.session.start(SESSION)
    await $.tool.call(editOf('/work/a.ts'))
    await $.tool.call(editOf('/work/b.ts'))

    expect(opened.filter(id => id === DIFF_PANE.id)).toHaveLength(1)
  })
})

describe('options: watched doc paths, defaults', () => {
  test('a built-in watched path opens the doc pane', async ($, on) => {
    const opened = openWorld(on)

    await $.session.start(SESSION)
    await $.tool.call(editOf('/work/docs/superpowers/plans/x.md'))

    expect(opened).toContain(DOC_PANE.id)
  })

  test('a markdown file outside the built-in paths, with watchedPaths unset, opens nothing', async ($, on) => {
    const opened = openWorld(on)

    await $.session.start(SESSION)
    await $.tool.call(editOf('/work/notes/x.md'))

    expect(opened).not.toContain(DOC_PANE.id)
  })

  test('a shown file has one title row: its path', async ($, on) => {
    openWorld(on)

    await $.session.start(SESSION)
    await $.tool.call(editOf('/work/docs/superpowers/plans/x.md'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, title: 'Doc' },
      requestId: DOC_PANE.id,
    })
    expect(await ui.find({ text: /^\/work\/docs\/superpowers\/plans\/x\.md$/ })).toBeDefined()
    // The basename alone is no longer a row of its own.
    expect(await ui.find({ text: /^x\.md$/ })).toBeUndefined()
  })

  test('a shown file with a caller title draws the title beside its path', async ($, on) => {
    openWorld(on)

    await $.session.start(SESSION)
    await $.tool.call({
      tool: TOOL,
      op: 'show',
      path: '/work/docs/superpowers/plans/x.md',
      title: 'My plan',
    })

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, title: 'Doc' },
      requestId: DOC_PANE.id,
    })
    expect(await ui.find({ text: /^My plan$/ })).toBeDefined()
    expect(await ui.find({ text: /^\/work\/docs\/superpowers\/plans\/x\.md$/ })).toBeDefined()
  })
})

const PLAN = '/home/u/.claude/plans/x.md'

const planNote = (type: 'plan_mode' | 'plan_mode_exit', hasPlan: boolean, agentId?: string) => ({
  type,
  text: '',
  origin: { kind: 'engine' as const },
  ...(agentId === undefined ? {} : { agentId }),
  detail: { reminder: 'full' as const, planFilePath: PLAN, hasPlan },
})

describe('plan mode', () => {
  function planWorld(on: On) {
    const opened = openWorld(on)
    on('prompt.attachment', ($, e) => ({ text: e.text }))
    return opened
  }

  test('an edit to an unguessed path opens nothing before plan mode names it', async ($, on) => {
    const opened = planWorld(on)

    await $.session.start(SESSION)
    await $.tool.call(editOf(PLAN))

    expect(opened).not.toContain(DOC_PANE.id)
  })

  test('the plan file plan mode names opens in the doc pane as it is written', async ($, on) => {
    const opened = planWorld(on)

    await $.session.start(SESSION)
    await $.prompt.attachment(planNote('plan_mode', false))
    expect(opened).not.toContain(DOC_PANE.id)
    await $.tool.call(editOf(PLAN))

    expect(opened).toContain(DOC_PANE.id)
  })

  test('leaving plan mode with a plan opens it', async ($, on) => {
    const opened = planWorld(on)

    await $.session.start(SESSION)
    await $.prompt.attachment(planNote('plan_mode_exit', true))

    expect(opened).toContain(DOC_PANE.id)
  })

  test("a subagent's plan note is ignored", async ($, on) => {
    const opened = planWorld(on)

    await $.session.start(SESSION)
    await $.prompt.attachment(planNote('plan_mode_exit', true, 'agent-1'))

    expect(opened).not.toContain(DOC_PANE.id)
  })
})

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
  forkText: string | null | Error,
  files: readonly string[] = ['a.ts'],
  messages: readonly SessionMessage[] = [],
  extraShownIds: readonly string[] = [],
) {
  const clock = baseWorld(on, storeEntries)
  on('session.messages', () => ({ value: [...messages] }))
  on('process.run', ($, e) => {
    const [cmd, sub] = e.argv
    if (cmd === 'git' && sub === 'rev-parse' && e.argv.includes('--show-toplevel')) {
      return ran(0, REPO)
    }
    if (cmd === 'git' && sub === 'status') {
      return ran(0, files.map(path => ` M ${path}\0`).join(''))
    }
    if (cmd === 'git' && e.argv.includes('--numstat')) {
      return ran(0, files.map(path => `1\t1\t${path}\0`).join(''))
    }
    // symbolic-ref/verify/merge-base (branch point) and loadHunks all get the same "nothing here".
    return ran(1)
  })
  on('model.fork', () => {
    if (forkText instanceof Error) throw forkText
    return {
      value:
        forkText === null
          ? { isAnswered: false, reason: 'nothing-to-fork' }
          : { isAnswered: true, text: forkText, usage: USAGE },
    }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))

  trackShownPanes(on, extraShownIds)
  return clock
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

  test('no control carries a letter hotkey; the list arrows ride the engine list actions', async ($, on) => {
    gitWorld(on, {}, null, ['a.ts', 'b.ts'])

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    const buttons = await ui.findAll({ type: 'Button' })
    expect(buttons.filter(button => button.props.hotkey !== undefined)).toEqual([])
    expect((await ui.find({ key: 'previous' }))?.props.action).toBe('app:diffFileListUp')
    expect((await ui.find({ key: 'next' }))?.props.action).toBe('app:diffFileListDown')
  })
})

describe('review stream', () => {
  test('every changed file has its heading in the pane at once', async ($, on) => {
    gitWorld(on, {}, null, ['a.ts', 'b.ts'])
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    expect(await ui.find({ key: 'a.ts#title' })).toBeDefined()
    expect(await ui.find({ key: 'b.ts#title' })).toBeDefined()
  })

  test('pressing a file row scrolls its heading to the top of the stream', async ($, on) => {
    gitWorld(on, {}, null, ['a.ts', 'b.ts'])
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      // kit.rows = 8; minus 2 header + 2 list + 1 rule leaves 3 body rows: one file's section.
      props: { ...PANE_PROPS, scroll: { offset: 0, bodyRows: 8 } },
      requestId: DIFF_PANE.id,
    })
    await ui.press({ key: 'file:b.ts' })
    expect(await ui.find({ key: 'a.ts#title' })).toBeUndefined()
    expect(await ui.find({ key: 'b.ts#title' })).toBeDefined()
    expect((await ui.find({ key: 'row:b.ts' }))?.text).toContain('❯')
  })

  test("scrolling the stream by wheel moves the list's ❯ to the file at the top", async ($, on) => {
    gitWorld(on, {}, null, ['a.ts', 'b.ts'])
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      // kit.rows = 8; minus 2 header + 2 list + 1 rule leaves 3 body rows: one file's section.
      props: { ...PANE_PROPS, scroll: { offset: 0, bodyRows: 8 } },
      requestId: DIFF_PANE.id,
    })
    expect((await ui.find({ key: 'row:a.ts' }))?.text).toContain('❯')

    await $.ui.scroll({
      component: 'Pane',
      requestId: DIFF_PANE.id,
      offset: 0,
      by: 10,
      bodyRows: 8,
      contentRows: 20,
      origin: { kind: 'person' },
    })

    expect((await ui.find({ key: 'row:b.ts' }))?.text).toContain('❯')
    expect((await ui.find({ key: 'row:a.ts' }))?.text).not.toContain('❯')
  })

  test('a file edited this turn is marked in the list until the turn ends', async ($, on) => {
    gitWorld(on, {}, null, ['a.ts', 'b.ts'])
    on('tool.call', { tool: 'Edit' }, () => ({ result: {} }))
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.tool.call({ tool: 'Edit', file_path: '/work/b.ts', old_string: 'a', new_string: 'b' })

    const ui = await mountDiff($)
    expect((await ui.find({ key: 'row:b.ts' }))?.text).toContain('●')
    expect((await ui.find({ key: 'row:a.ts' }))?.text).not.toContain('●')

    await $.turn.complete(mainLoopTurn('done'))
    expect((await ui.find({ key: 'row:b.ts' }))?.text).not.toContain('●')
  })

  test("an edit's refresh follows its file into view when it starts out of view", async ($, on) => {
    const clock = gitWorld(on, {}, null, ['a.ts', 'b.ts'])
    on('tool.call', { tool: 'Edit' }, () => ({ result: {} }))
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      // kit.rows = 8; minus 2 header + 2 list + 1 rule leaves 3 body rows: one file's section, so
      // b.ts (the second file) starts out of view.
      props: { ...PANE_PROPS, scroll: { offset: 0, bodyRows: 8 } },
      requestId: DIFF_PANE.id,
    })
    expect(await ui.find({ key: 'b.ts#title' })).toBeUndefined()

    await $.tool.call({ tool: 'Edit', file_path: '/work/b.ts', old_string: 'a', new_string: 'b' })
    // The refresh is debounced; advance the mock clock past it.
    await clock.advance(300)

    expect(await ui.find({ key: 'b.ts#title' })).toBeDefined()
  })

  test('a person scroll this turn stops a further edit from moving the view', async ($, on) => {
    const clock = gitWorld(on, {}, null, ['a.ts', 'b.ts'])
    on('tool.call', { tool: 'Edit' }, () => ({ result: {} }))
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, scroll: { offset: 0, bodyRows: 8 } },
      requestId: DIFF_PANE.id,
    })

    // The person scrolls down to b.ts, then back up to a.ts, dropping follow for this turn.
    await $.ui.scroll({
      component: 'Pane',
      requestId: DIFF_PANE.id,
      offset: 0,
      by: 10,
      bodyRows: 8,
      contentRows: 20,
      origin: { kind: 'person' },
    })
    expect(await ui.find({ key: 'a.ts#title' })).toBeUndefined()
    await $.ui.scroll({
      component: 'Pane',
      requestId: DIFF_PANE.id,
      offset: 0,
      by: -10,
      bodyRows: 8,
      contentRows: 20,
      origin: { kind: 'person' },
    })
    expect(await ui.find({ key: 'a.ts#title' })).toBeDefined()

    await $.tool.call({ tool: 'Edit', file_path: '/work/b.ts', old_string: 'a', new_string: 'b' })
    await clock.advance(300)

    expect(await ui.find({ key: 'a.ts#title' })).toBeDefined()
    expect(await ui.find({ key: 'b.ts#title' })).toBeUndefined()
  })
})

describe('diff header', () => {
  test('send is the primary action once a comment is pending', async ($, on) => {
    const pending = { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [pending] }, null)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    expect((await ui.find({ key: 'send' }))?.props.variant).toBe('primary')
  })

  test('an armed clear says to press again', async ($, on) => {
    const pending = { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [pending] }, null)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    await ui.press({ key: 'clear' })
    expect((await ui.find({ key: 'clear' }))?.text).toContain('clear all? press again')
  })

  test('the file-level comment button names its target', async ($, on) => {
    gitWorld(on, {}, null)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    expect(await ui.find({ text: '＋ note on file' })).toBeDefined()
    expect(await ui.find({ text: /comment on this/ })).toBeUndefined()
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

  test('a fork rejection leaves the comment sent and never surfaces as an unhandled rejection', async ($, on) => {
    const sent = { id: 'c4', path: 'a.ts', text: 'fix this', status: 'sent', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [sent] }, new Error('fork failed'))

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.turn.complete(mainLoopTurn('done'))

    const ui = await mountDiff($)
    expect(await ui.find({ text: /addressed/ })).toBeUndefined()
    expect(await ui.find({ text: /fix this/ })).toBeDefined()
  })
})

const HUNK_HEADER = '@@ -1,2 +1,2 @@'
const HUNK_TEXT = `${HUNK_HEADER}\n a\n-b\n+c\n`

/** A world inside a git repo with one file carrying one hunk, so stage/revert have something to act on. */
function hunkWorld(
  on: On,
  onApply: (argv: readonly string[], stdin: string | undefined) => void,
  diffTextOf: () => string = () => HUNK_TEXT,
) {
  baseWorld(on)
  on('process.run', ($, e) => {
    const [cmd, sub] = e.argv
    if (cmd === 'git' && sub === 'rev-parse') return ran(0, REPO)
    if (cmd === 'git' && sub === 'status') return ran(0, ' M a.ts\0')
    if (cmd === 'git' && e.argv.includes('--numstat')) return ran(0, '1\t1\ta.ts\0')
    if (cmd === 'git' && sub === 'apply') {
      onApply(e.argv, e.init?.stdin)
      return ran(0)
    }
    // The all-files bulk diff `loadAllHunks` issues (refresh): a real multi-file diff, sectioned
    // by `diff --git` lines, so `diffSectionsOf` can find a.ts's section.
    if (cmd === 'git' && e.argv.includes('-c')) {
      return ran(0, `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n${diffTextOf()}`)
    }
    // The single-file diff `readHunks` issues (applyHunk's re-check): just the hunk text.
    return ran(0, diffTextOf())
  })

  trackShownPanes(on)
}

describe('stage and revert a hunk', () => {
  test('pressing stage applies git apply --cached with the hunk patch on stdin', async ($, on) => {
    const applied: { argv?: readonly string[]; stdin?: string } = {}
    hunkWorld(on, (argv, stdin) => {
      applied.argv = argv
      applied.stdin = stdin
    })

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    await ui.press({ key: stageKeyOf({ path: 'a.ts', hunk: HUNK_HEADER }) })

    expect(applied.argv).toEqual(['git', 'apply', '--cached', '--recount', '-'])
    expect(applied.stdin).toContain(HUNK_TEXT)
  })

  test('a hunk that changed since it was rendered is not applied; a toast explains and the view refreshes', async ($, on) => {
    let diffText = HUNK_TEXT
    let applyRan = false
    hunkWorld(
      on,
      () => {
        applyRan = true
      },
      () => diffText,
    )
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)

    // The working tree changes between the render above and the stage press below.
    diffText = '@@ -1,2 +1,2 @@\n a\n-b\n+d\n'

    await ui.press({ key: stageKeyOf({ path: 'a.ts', hunk: HUNK_HEADER }) })

    expect(applyRan).toBe(false)
    expect(toasts).toContain('The hunk changed — refreshed, try again')
  })
})

const TURN_MESSAGES: SessionMessage[] = [
  { role: 'user', text: 'refactor the helper', toolUses: [] },
  {
    role: 'assistant',
    text: '',
    toolUses: [
      {
        tool_use_id: 'edit-1',
        tool: 'Edit',
        input: { file_path: '/work/util.ts', old_string: 'a', new_string: 'b' },
      },
    ],
  },
  {
    role: 'user',
    text: '',
    toolUses: [],
    toolResults: [{ tool_use_id: 'edit-1', text: 'ok', isError: false }],
  },
]

describe('switching the diff source to a turn', () => {
  test('picking a turn shows its edited file in the list', async ($, on) => {
    gitWorld(on, {}, null, ['a.ts'], TURN_MESSAGES)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    expect(await ui.find({ key: 'row:/work/util.ts' })).toBeUndefined()

    await ui.select({ key: SOURCE_SELECT_KEY, value: turnValueOf(1) })

    expect(await ui.find({ key: 'row:/work/util.ts' })).toBeDefined()
    // The header's source picker already names the turn; the stream heading names its file.
    expect((await ui.find({ key: '/work/util.ts#title' }))?.text).toContain('/work/util.ts')
  })
})

/** A world whose global config answers as given, with every toast raised recorded. */
function configWorld(on: On, stdout: string, globalConfig: unknown) {
  world(on, stdout, { HOME: '/home' })
  on('fs.read', () => ({ value: JSON.stringify(globalConfig) }))
  const toasts: string[] = []
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  return toasts
}

const ABOVE_PROMPT_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 5,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 5 },
  view: {},
}

const mountBand = ($: Engine) =>
  $.ui.mount({
    plugin: NAME,
    surface: 'terminal',
    component: 'AbovePrompt',
    props: ABOVE_PROMPT_PROPS,
  })

describe('the AbovePrompt status band', () => {
  test('shows pending comments when no Raven pane is open', async ($, on) => {
    const pending = { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [pending] }, null)

    await $.session.start(SESSION)

    const ui = await mountBand($)
    expect(await ui.find({ text: /comments? pending/ })).toBeDefined()
  })

  test('draws nothing while the diff pane is open and shown', async ($, on) => {
    const pending = { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [pending] }, null)
    // Stands in for the engine's own drawing once Raven passes with `next(e)`.
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [''] }))

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountBand($)
    expect(await ui.find({ text: /pending/ })).toBeUndefined()
  })

  test('draws nothing when the engine reports the diff pane shown even though this instance never opened it (hot reload)', async ($, on) => {
    const pending = { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 }
    // A reloaded module's `open` bookkeeping starts empty; the engine itself still shows the pane.
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [pending] }, null, ['a.ts'], [], [DIFF_PANE.id])
    // Stands in for the engine's own drawing once Raven passes with `next(e)`.
    on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Text', children: [''] }))

    await $.session.start(SESSION)
    // No `/raven diff` run here: this instance's `open` set stays empty.

    const ui = await mountBand($)
    expect(await ui.find({ text: /pending/ })).toBeUndefined()
  })
})

const COMMAND_OUTPUT_PROPS = {
  command: 'raven',
  args: '',
  text: 'Raven diff hidden',
  isErrored: false,
}

const mountCommandOutput = ($: Engine) =>
  $.ui.mount({
    plugin: NAME,
    surface: 'terminal',
    component: 'CommandOutput',
    props: COMMAND_OUTPUT_PROPS,
  })

describe('the /raven command output row', () => {
  test('draws the reply behind a hidden glyph', async ($, on) => {
    world(on, '')

    await $.session.start(SESSION)
    // Opens, then hides, so `raven` has actually recorded this exact text as 'hidden'.
    await $.command.run(ravenCommand('diff'))
    await $.command.run(ravenCommand('diff'))

    const ui = await mountCommandOutput($)
    expect(await ui.find({ text: '◇ Raven diff hidden' })).toBeDefined()
  })

  test('a row whose text no command call in this session produced falls back to the neutral glyph', async ($, on) => {
    world(on, '')

    await $.session.start(SESSION)

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'CommandOutput',
      props: { ...COMMAND_OUTPUT_PROPS, text: 'a stale row from a past session' },
    })
    expect(await ui.find({ text: '◆ a stale row from a past session' })).toBeDefined()
  })
})

describe('the built-in diff panel warning', () => {
  test('the first /raven toasts once when the sidebar is open and checkpointing is on', async ($, on) => {
    const toasts = configWorld(on, '', { diffSidebarOpen: true })

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.command.run(ravenCommand('doc'))

    expect(toasts).toHaveLength(1)
  })

  test('no toast when the sidebar is already closed', async ($, on) => {
    const toasts = configWorld(on, '', { diffSidebarOpen: false })

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    expect(toasts).toHaveLength(0)
  })
})

describe('prompt carries the review', () => {
  function promptWorld(on: On, comments: readonly unknown[]) {
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: comments }, null)
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('prompt.submit', ($, e) => ({ text: e.text }))
    return toasts
  }

  test('a composer prompt that carries pending comments says so', async ($, on) => {
    const toasts = promptWorld(on, [
      { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 },
      { id: 'c2', path: 'a.ts', text: 'and this', status: 'pending', createdAt: 1 },
    ])

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })

    expect(toasts).toContain('Raven: 2 review comments sent with this prompt')
  })

  test('no pending comments, no toast', async ($, on) => {
    const toasts = promptWorld(on, [])

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })

    expect(toasts.filter(text => text.includes('review comment'))).toEqual([])
  })
})

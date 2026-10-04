import type { On, SessionMessage, TurnCompleteInput } from 'claude-code'
import { describe, type Engine, expect, mock, test, tier } from 'claude-code/testing'
import {
  commentsStoreKeyOf,
  DIFF_PANE,
  DOC_PANE,
  NAME,
  TASKS_PANE,
  TREE_PANE,
  toolNameOf,
} from '../hooks/names'
import {
  cancelKeyOf,
  commentButtonKeyOf,
  dropKeyOf,
  hunkHeaderKeyOf,
  inputKeyOf,
  noteKeyOf,
  revertKeyOf,
  stageKeyOf,
} from '../hooks/views/diff/anchor'
import { ACTIONS_ROW_KEY, SOURCE_SELECT_KEY, SUMMARY_ROW_KEY } from '../hooks/views/diff/header'
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

  return trackShownPanes(on)
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

  test('the show tool opens a pane and a second call leaves it showing', async ($, on) => {
    const shown = world(on, '')

    await $.session.start(SESSION)
    const first = await $.tool.call({ tool: TOOL, op: 'open', pane: 'files' })
    const second = await $.tool.call({ tool: TOOL, op: 'open', pane: 'files' })

    expect(first.text).toBe('Shown in the Raven pane: the files pane.')
    expect(second.text).toBe('Shown in the Raven pane: the files pane.')
    expect([...shown]).toEqual([TREE_PANE.id])
  })

  for (const [pane, id] of [
    ['diff', DIFF_PANE.id],
    ['doc', DOC_PANE.id],
    ['tasks', TASKS_PANE.id],
  ] as const) {
    test(`the show tool opens the ${pane} pane`, async ($, on) => {
      const shown = world(on, '')

      await $.session.start(SESSION)
      await $.tool.call({ tool: TOOL, op: 'open', pane })

      expect([...shown]).toContain(id)
    })
  }

  test('the show tool refuses an open call with an unknown pane', async ($, on) => {
    world(on, '')

    await $.session.start(SESSION)
    const result = await $.tool.call({ tool: TOOL, op: 'open', pane: 'nonsense' })

    expect(result.deny).toBeDefined()
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

  test('the Tasks pane draws a progress bar and a state dot per task, coloured by status', async ($, on) => {
    world(on, '')
    on('tool.call', { tool: 'TodoWrite' }, () => ({ result: {} }))

    await $.session.start(SESSION)
    await $.tool.call({
      tool: 'TodoWrite',
      todos: [
        { content: 'write tests', status: 'completed' },
        { content: 'ship it', status: 'in_progress' },
        { content: 'tell the owner', status: 'pending' },
      ],
    })
    await $.command.run(ravenCommand('tasks'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: PANE_PROPS,
      requestId: TASKS_PANE.id,
    })
    expect(await ui.find({ text: /█/ })).toBeDefined()
    expect(await ui.find({ text: '●' })).toBeDefined()
    expect(await ui.find({ text: '◐' })).toBeDefined()
    expect(await ui.find({ text: '○' })).toBeDefined()
  })
})

/**
 * A world like `world`'s, but recording every pane opened rather than just the ones currently
 * shown, so a test can tell an auto-open happened from one that never did.
 */
function openWorld(on: On, docText: Record<string, string> | ((path: string) => string) = {}) {
  const opened: string[] = []
  baseWorld(on)
  on('process.run', () => ran(128, '', 'not a repo'))
  // `ui.invalidate` is left to the engine's own implementation (not stubbed): a stub answering it
  // here would swallow `host.redraw()`, and a mounted pane would never redraw after a press.
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
  on('fs.read', ($, e) => ({
    value: typeof docText === 'function' ? docText(e.path) : (docText[e.path] ?? ''),
  }))
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

  const DOC_PATH = '/work/docs/superpowers/plans/x.md'

  test('a note on a doc section rides the next prompt under that section', async ($, on) => {
    openWorld(on, { [DOC_PATH]: '# Plan\n\nIntro\n\n## Goals\n\n- a\n' })
    on('prompt.submit', ($, e) => ({ text: e.text }))
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })

    await $.session.start(SESSION)
    await $.tool.call(editOf(DOC_PATH))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, title: 'Doc' },
      requestId: DOC_PANE.id,
    })
    // Sections of '# Plan\n\nIntro\n\n## Goals\n\n- a\n' are [Plan (0), Goals (1)]: Goals is §1.
    const goals = { path: DOC_PATH, hunk: '§1' }
    await ui.press({ key: commentButtonKeyOf(goals) })
    await ui.input({ key: inputKeyOf(goals), text: 'tighten the goals' })
    expect(await ui.find({ text: /tighten the goals/ })).toBeDefined()

    await $.prompt.submit({ text: 'go', origin: { kind: 'composer' }, wait: false })
    expect(toasts).toContain('Raven: 1 review comment sent with this prompt')
  })

  test('two sections sharing a heading draw their notes under the right one, by index', async ($, on) => {
    openWorld(on, { [DOC_PATH]: '# Notes\na\n\n# Notes\nb\n' })

    await $.session.start(SESSION)
    await $.tool.call(editOf(DOC_PATH))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, title: 'Doc' },
      requestId: DOC_PANE.id,
    })
    const secondNotes = { path: DOC_PATH, hunk: '§1' }
    await ui.press({ key: commentButtonKeyOf(secondNotes) })
    await ui.input({ key: inputKeyOf(secondNotes), text: 'only on the second one' })

    expect((await ui.find({ key: 'section:1' }))?.text).toContain('only on the second one')
    expect((await ui.find({ key: 'section:0' }))?.text).not.toContain('only on the second one')
  })

  test('a doc comment whose section is gone draws under an Outdated row', async ($, on) => {
    let text = '# Gone\n\nold topic\n'
    openWorld(on, path => (path === DOC_PATH ? text : ''))

    await $.session.start(SESSION)
    await $.tool.call(editOf(DOC_PATH))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, title: 'Doc' },
      requestId: DOC_PANE.id,
    })
    const gone = { path: DOC_PATH, hunk: '§0' }
    await ui.press({ key: commentButtonKeyOf(gone) })
    await ui.input({ key: inputKeyOf(gone), text: 'orphan' })
    expect(await ui.find({ text: /orphan/ })).toBeDefined()

    // The doc changes under it: the 'Gone' section no longer exists, so the comment orphans.
    text = '# Still here\n\nnew topic\n'
    await $.tool.call(editOf(DOC_PATH))

    expect(await ui.find({ text: 'Outdated' })).toBeDefined()
    expect(await ui.find({ text: /orphan/ })).toBeDefined()
  })

  /** Issues the `show` directive for `path`, the way `raven doc <path>` prints it on stdout. */
  const showDirective = (on: On, path: string) =>
    on('tool.call', { tool: 'Bash' }, () => ({
      result: {
        stdout: `::raven::${JSON.stringify({ op: 'show', path })}\n${FALLBACK}\n`,
        stderr: '',
        interrupted: false,
      },
    }))

  test('a diff comment on a file also shown in the Doc pane never draws there, and still shows in the diff', async ($, on) => {
    const path = 'notes.md'
    gitWorld(
      on,
      {
        [commentsStoreKeyOf(REPO)]: [
          { id: 'c1', path, text: 'fix this hunk', status: 'pending', createdAt: 0 },
        ],
      },
      null,
      [path],
    )
    on('fs.read', () => ({ value: '# Notes\n\nbody\n' }))
    showDirective(on, path)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.tool.call({ tool: 'Bash', command: 'raven doc notes.md' })

    const docUi = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, title: 'Doc' },
      requestId: DOC_PANE.id,
    })
    expect(await docUi.find({ text: /notes\.md/ })).toBeDefined()
    expect(await docUi.find({ text: /fix this hunk/ })).toBeUndefined()
    expect(await docUi.find({ text: 'Outdated' })).toBeUndefined()

    const diffUi = await mountDiff($)
    expect(await diffUi.find({ text: /fix this hunk/ })).toBeDefined()
  })

  test('two addressed notes on one doc section draw as one "2 addressed" row', async ($, on) => {
    const path = 'notes.md'
    const addressedComment = (id: string, createdAt: number) => ({
      id,
      path,
      section: 'Notes',
      sectionIndex: 0,
      text: `note ${id}`,
      status: 'addressed',
      createdAt,
    })
    gitWorld(
      on,
      { [commentsStoreKeyOf(REPO)]: [addressedComment('c1', 0), addressedComment('c2', 1)] },
      null,
      [],
    )
    on('fs.read', () => ({ value: '# Notes\n\nbody\n' }))
    showDirective(on, path)

    await $.session.start(SESSION)
    await $.tool.call({ tool: 'Bash', command: 'raven doc notes.md' })

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, title: 'Doc' },
      requestId: DOC_PANE.id,
    })
    expect(await ui.find({ text: '✓ 2 addressed' })).toBeDefined()
    expect(await ui.find({ text: /note c1/ })).toBeUndefined()
    expect(await ui.find({ text: /note c2/ })).toBeUndefined()
    expect(await ui.find({ text: 'Outdated' })).toBeUndefined()
  })

  test('two addressed notes on a doc comment whose section is gone still collapse as "2 addressed", under Outdated', async ($, on) => {
    const path = 'notes.md'
    const addressedComment = (id: string, createdAt: number) => ({
      id,
      path,
      section: 'Gone',
      sectionIndex: 0,
      text: `note ${id}`,
      status: 'addressed',
      createdAt,
    })
    gitWorld(
      on,
      { [commentsStoreKeyOf(REPO)]: [addressedComment('c1', 0), addressedComment('c2', 1)] },
      null,
      [],
    )
    // The doc the Doc pane actually shows has no 'Gone' heading, so both comments are outdated
    // the moment they're read, with no live section to draw under.
    on('fs.read', () => ({ value: '# Still here\n\nnew topic\n' }))
    showDirective(on, path)

    await $.session.start(SESSION)
    await $.tool.call({ tool: 'Bash', command: 'raven doc notes.md' })

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, title: 'Doc' },
      requestId: DOC_PANE.id,
    })
    expect(await ui.find({ text: 'Outdated' })).toBeDefined()
    expect(await ui.find({ text: '✓ 2 addressed' })).toBeDefined()
    expect(await ui.find({ text: /note c1/ })).toBeUndefined()
    expect(await ui.find({ text: /note c2/ })).toBeUndefined()
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

type StripRowOf = { id?: string; left: { t: string }[]; right?: { t: string; id?: string }[] }

const mountDiff = ($: Engine) =>
  $.ui.mount({
    plugin: NAME,
    surface: 'terminal',
    component: 'Pane',
    props: PANE_PROPS,
    requestId: DIFF_PANE.id,
  })

/**
 * An element's own real drawn width, reconstructed from the raw tree the mod-kit harness returns
 * (`type`, `props`, `children`) rather than `.text` — which flattens a `Button` down to its bare
 * label and drops every `Box`'s `gap`, so it cannot stand in for "does this actually fit" the way
 * the other narrowest-pane tests use it (see the R28 test above). A `Button` draws `[ label ]`
 * (`types/claude-code.d.ts`'s own documented convention, `chips.tsx`'s `buttonWidthOf`); a row
 * `Box` sums its children plus one `gap` between each; any other `Box` (here, always a single
 * child) is its child's width; a `Text` is the length of its string children, recursing into any
 * nested `Text` (the change map nests one coloured `Text` per glyph).
 */
function drawnWidth(
  el: { type: string; props?: Record<string, unknown>; children?: unknown[] } | undefined,
): number {
  if (!el) return 0
  if (el.type === 'Button') return ((el.props?.label as string | undefined)?.length ?? 0) + 4
  const kids = (el.children ?? []) as readonly unknown[]
  if (el.type === 'Text') {
    return kids.reduce(
      (sum: number, child) =>
        sum + (typeof child === 'string' ? child.length : drawnWidth(child as typeof el)),
      0,
    )
  }
  if (el.type === 'Box') {
    const widths = kids.map(child => drawnWidth(child as typeof el))
    if (el.props?.flexDirection === 'row') {
      const gap = (el.props?.gap as number | undefined) ?? 0
      return widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, kids.length - 1)
    }
    return Math.max(0, ...widths)
  }
  return 0
}

/**
 * Whether any `Box` in the subtree draws `display: "none"` — the narrowest-pane R30 test's own
 * guard, independent of `drawnWidth`'s arithmetic: a `display: "none"` wrapper around a nav
 * Button would still happen to measure `0` and so wouldn't fail the `<= 38` assertion on its own
 * (that was ruling R30's *first* fix, fix round 1, before a live Tab-focus probe found the
 * ring silently stopping on it with no visible mark — see the task report), so this walks the raw
 * tree directly rather than trusting a width proxy to notice a chip has gone invisible.
 */
function anyDisplayNone(
  el: { type: string; props?: Record<string, unknown>; children?: unknown[] } | undefined,
): boolean {
  if (!el) return false
  if (el.props?.display === 'none') return true
  const kids = (el.children ?? []) as readonly unknown[]
  return kids.some(child => anyDisplayNone(child as typeof el))
}

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
  // Which paths `existingPathsOf`'s batched `git ls-files -- <paths>` call reports as present;
  // defaults to `files` so a world that never sets this still answers the old no-pathspec
  // `git ls-files` listing (the Files tree's) the same way it always has.
  existing: readonly string[] = files,
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
    // `existingPathsOf` runs `git --literal-pathspecs -C <toplevel> ls-files … -- <paths>`, so
    // `ls-files` is no longer necessarily `argv[1]`; the Files tree's own plain, no-pathspec,
    // no-`-C` call still is.
    if (cmd === 'git' && e.argv.includes('ls-files')) {
      const dashIndex = e.argv.indexOf('--')
      // No pathspec: the Files tree's own full-repo listing. A pathspec (after `--`):
      // `existingPathsOf`'s batched existence check, answered from `existing` alone.
      const universe =
        dashIndex === -1
          ? files
          : e.argv.slice(dashIndex + 1).filter(path => existing.includes(path))
      return ran(0, universe.map(path => `${path}\0`).join(''))
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

  test('a file-list row carries a status dot and the stat bar', async ($, on) => {
    gitWorld(on, {}, null, ['a.ts'])
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    const row = await ui.find({ key: 'row:a.ts' })
    expect(row?.text).toContain('●')
    expect(row?.text).toContain('■')
  })

  test("a much smaller change's stat bar draws fewer filled cells than the list's biggest change", async ($, on) => {
    baseWorld(on)
    on('session.messages', () => ({ value: [] }))
    on('process.run', ($, e) => {
      const [cmd, sub] = e.argv
      if (cmd === 'git' && sub === 'rev-parse' && e.argv.includes('--show-toplevel')) {
        return ran(0, REPO)
      }
      if (cmd === 'git' && sub === 'status') return ran(0, ' M a.ts\0 M b.ts\0')
      if (cmd === 'git' && e.argv.includes('--numstat')) {
        // A literal `\0` immediately followed by a digit in one template is a legacy octal
        // escape in JS (`\01` is code point 1, not NUL then "1"), so each record's own template
        // ends right after its `\0` and `.join('')` glues the real runtime strings together.
        const records = [
          ['a.ts', 1, 1],
          ['b.ts', 100, 100],
        ] as const
        return ran(0, records.map(([path, adds, dels]) => `${adds}\t${dels}\t${path}\0`).join(''))
      }
      return ran(1)
    })
    on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork' } }))
    on('turn.complete', ($, e) => ({ text: e.answer }))
    trackShownPanes(on)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    const small = (await ui.find({ key: 'row:a.ts' }))?.text ?? ''
    const big = (await ui.find({ key: 'row:b.ts' }))?.text ?? ''
    const fillCountOf = (text: string) => (text.match(/■/g) ?? []).length
    expect(fillCountOf(small)).toBeLessThan(fillCountOf(big))
  })

  test("the file being edited this turn draws its section's rail in the accent, not its status colour", async ($, on) => {
    gitWorld(on, {}, null, ['a.ts', 'b.ts'])
    on('tool.call', { tool: 'Edit' }, () => ({ result: {} }))
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.tool.call({ tool: 'Edit', file_path: '/work/b.ts', old_string: 'a', new_string: 'b' })

    const ui = await mountDiff($)
    const railColorOf = async (titleKey: string) => {
      const found = await ui.find({ key: titleKey })
      const rail = found?.children[0] as { props?: { color?: string } } | undefined
      return rail?.props?.color
    }
    expect(await railColorOf('b.ts#title')).toBe('claude')
    expect(await railColorOf('a.ts#title')).not.toBe('claude')
  })

  test("each file's section carries a left rail; a blank gap row (no rail) separates two files", async ($, on) => {
    gitWorld(on, {}, null, ['a.ts', 'b.ts'])
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    const ui = await mountDiff($)

    expect((await ui.find({ key: 'a.ts#title' }))?.text.startsWith('▌')).toBe(true)
    expect((await ui.find({ key: 'a.ts#status' }))?.text.startsWith('▌')).toBe(true)
    expect((await ui.find({ key: 'b.ts#sep' }))?.text.startsWith('▌')).toBe(false)
  })

  test("a file's section keeps its left rail deep into a scroll, past its own title and most of its hunk", async ($, on) => {
    hunkWorld(on, () => {})
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    // kit.rows = 6; minus 2 header + 1 list + 1 rule leaves 2 body rows: fewer than a.ts's 5-row
    // section (title, hunk-header, HUNK_TEXT's 3 code lines), so scrolling clamps to a top that
    // scrolls the title and most of the hunk's code out of view.
    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, scroll: { offset: 0, bodyRows: 6 } },
      requestId: DIFF_PANE.id,
    })
    await $.ui.scroll({
      component: 'Pane',
      requestId: DIFF_PANE.id,
      offset: 0,
      by: 4,
      bodyRows: 2,
      contentRows: 5,
      origin: { kind: 'person' },
    })

    expect(await ui.find({ key: 'a.ts#title' })).toBeUndefined()
    // The header row (row 1) scrolls out of view too; what's left is the hunk's own (partially
    // sliced) code block, still carrying the rail.
    const hunkCode = await ui.find({ key: `a.ts#hunk:0:${HUNK_HEADER}` })
    expect(hunkCode?.text.startsWith('▌')).toBe(true)
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
      // kit.rows = 7; minus 2 header + 2 list + 1 rule leaves 2 body rows: less than either
      // file's section (title + status, unread with no hunks), so scrolling can reach past
      // a.ts's into b.ts's title.
      props: { ...PANE_PROPS, scroll: { offset: 0, bodyRows: 7 } },
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
    expect((await ui.find({ key: 'row:b.ts' }))?.text).toContain('◉')
    expect((await ui.find({ key: 'row:a.ts' }))?.text).not.toContain('◉')

    await $.turn.complete(mainLoopTurn('done'))
    expect((await ui.find({ key: 'row:b.ts' }))?.text).not.toContain('◉')
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

  test('a stale follow target does not re-apply on a later refresh after a person scroll', async ($, on) => {
    const clock = gitWorld(on, {}, null, ['a.ts', 'b.ts'])
    on('tool.call', { tool: 'Edit' }, () => ({ result: {} }))
    on('tool.call', { tool: 'Bash' }, () => ({
      result: { stdout: '', stderr: '', interrupted: false },
    }))
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, scroll: { offset: 0, bodyRows: 8 } },
      requestId: DIFF_PANE.id,
    })
    expect(await ui.find({ key: 'b.ts#title' })).toBeUndefined()

    // The edit's refresh follows b.ts into view.
    await $.tool.call({ tool: 'Edit', file_path: '/work/b.ts', old_string: 'a', new_string: 'b' })
    await clock.advance(300)
    expect(await ui.find({ key: 'b.ts#title' })).toBeDefined()

    // The person scrolls back up to a.ts, dropping follow (and its stale target) for this turn.
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

    // A later refresh with no edit of its own (a shell call) must not re-apply the old follow
    // target and jump back to b.ts.
    await $.tool.call({ tool: 'Bash', command: 'echo hi' })
    await clock.advance(300)

    expect(await ui.find({ key: 'a.ts#title' })).toBeDefined()
    expect(await ui.find({ key: 'b.ts#title' })).toBeUndefined()
  })

  test('the first edit of a session is marked, even though it is the auto-open refresh and the repository is not yet loaded', async ($, on) => {
    gitWorld(on, {}, null, ['a.ts', 'b.ts'])
    on('tool.call', { tool: 'Edit' }, () => ({ result: {} }))
    await $.session.start(SESSION)

    // No `/raven diff` first: this edit is the one that auto-opens the pane.
    await $.tool.call({ tool: 'Edit', file_path: '/work/b.ts', old_string: 'a', new_string: 'b' })

    const ui = await mountDiff($)
    expect((await ui.find({ key: 'row:b.ts' }))?.text).toContain('◉')
  })

  test('a file-list press turns follow off for the rest of the turn', async ($, on) => {
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

    // A first edit on b.ts follows it into view.
    await $.tool.call({ tool: 'Edit', file_path: '/work/b.ts', old_string: 'a', new_string: 'b' })
    await clock.advance(300)
    expect(await ui.find({ key: 'b.ts#title' })).toBeDefined()

    // The person presses a.ts's row, bringing the view back and dropping follow for the turn.
    await ui.press({ key: 'file:a.ts' })
    expect(await ui.find({ key: 'a.ts#title' })).toBeDefined()

    // A second edit on b.ts must not pull the view away again this turn.
    await $.tool.call({ tool: 'Edit', file_path: '/work/b.ts', old_string: 'b', new_string: 'c' })
    await clock.advance(300)

    expect(await ui.find({ key: 'a.ts#title' })).toBeDefined()
    expect(await ui.find({ key: 'b.ts#title' })).toBeUndefined()
  })

  test('a directive reveal does not turn follow off', async ($, on) => {
    const clock = gitWorld(on, {}, null, ['a.ts', 'b.ts'])
    on('tool.call', { tool: 'Edit' }, () => ({ result: {} }))
    on('tool.call', { tool: 'Bash' }, () => ({
      result: {
        stdout: '::raven::{"op":"diff","path":"/work/a.ts"}\n',
        stderr: '',
        interrupted: false,
      },
    }))
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, scroll: { offset: 0, bodyRows: 8 } },
      requestId: DIFF_PANE.id,
    })

    // A programmatic reveal of the file already selected and in view — unlike a person's press,
    // it must leave follow on.
    await $.tool.call({ tool: 'Bash', command: 'raven diff /work/a.ts' })
    expect(await ui.find({ key: 'a.ts#title' })).toBeDefined()

    await $.tool.call({ tool: 'Edit', file_path: '/work/b.ts', old_string: 'a', new_string: 'b' })
    await clock.advance(300)

    expect(await ui.find({ key: 'b.ts#title' })).toBeDefined()
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

  test('an armed clear confirms with "clear all?"', async ($, on) => {
    const pending = { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [pending] }, null)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    await ui.press({ key: 'clear' })
    expect((await ui.find({ key: 'clear' }))?.text).toContain('clear all?')
  })

  test('the send chip shrinks to its icon and count at the narrowest docked pane', async ($, on) => {
    const pending = [
      { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 },
      { id: 'c2', path: 'a.ts', text: 'fix that', status: 'pending', createdAt: 0 },
    ]
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: pending }, null)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, bodyColumns: 38 },
      requestId: DIFF_PANE.id,
    })

    expect((await ui.find({ key: 'send' }))?.text).toContain('➤ 2')
  })

  test('an armed clear keeps its full confirm words even at the narrowest docked pane', async ($, on) => {
    gitWorld(on, {}, null)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, bodyColumns: 38 },
      requestId: DIFF_PANE.id,
    })

    await ui.press({ key: 'clear' })
    expect((await ui.find({ key: 'clear' }))?.text).toContain('clear all?')
  })

  test('row 2 starts with the change map, tallest glyph for the biggest change', async ($, on) => {
    baseWorld(on)
    on('process.run', ($, e) => {
      const [cmd, sub] = e.argv
      if (cmd === 'git' && sub === 'rev-parse' && e.argv.includes('--show-toplevel')) {
        return ran(0, REPO)
      }
      if (cmd === 'git' && sub === 'status') return ran(0, ' M a.ts\0 M b.ts\0')
      if (cmd === 'git' && e.argv.includes('--numstat')) {
        return ran(0, '9\t1\ta.ts\x001\t0\tb.ts\0')
      }
      return ran(1)
    })
    trackShownPanes(on)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    const row = await ui.find({ key: ACTIONS_ROW_KEY })
    expect(row?.text?.startsWith('█▁')).toBe(true)
  })

  test('row 1 packs the picker after the stat bar, nothing stretched to the far right', async ($, on) => {
    gitWorld(on, {}, null)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    const row = await ui.find({ key: SUMMARY_ROW_KEY })
    // `.text` only flattens string-drawing leaves; a `Select` isn't one (confirmed live), so
    // order is read off `children` (document order) instead: the stat bar is the third child
    // (count, diffStat, statBar), the dim `·`, then the picker last.
    const children = (row?.children ?? []) as readonly { type: string; props?: { key?: string } }[]
    const pickerIndex = children.findIndex(child => child.props?.key === 'source')
    expect(children.length).toBeGreaterThanOrEqual(5)
    expect(pickerIndex).toBe(children.length - 1)
    expect(pickerIndex).toBeGreaterThan(2)
  })

  test('row 2 shrinks refresh before edit & send and send, which keep their words at the default pane', async ($, on) => {
    // 15 files, so the change map's left-side width (15 cells + the notes text) pushes the
    // chips' room just under what every chip in words needs, but not so far under that the
    // shrink has to reach edit & send or send: only refresh (and nav, which looks the same
    // either way) need to give way.
    const files = Array.from({ length: 15 }, (_, i) => `f${i}.ts`)
    const pending = [
      { id: 'c1', path: 'f0.ts', text: 'fix this', status: 'pending', createdAt: 0 },
      { id: 'c2', path: 'f0.ts', text: 'fix that', status: 'pending', createdAt: 0 },
    ]
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: pending }, null, files)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    expect((await ui.find({ key: 'send' }))?.text).toContain('send 2')
    expect((await ui.find({ key: 'edit-send' }))?.text).toContain('edit & send')
    expect((await ui.find({ key: 'refresh' }))?.text).not.toContain('refresh')
  })

  test('an armed clear drops nav and refresh from row 2 and keeps its own words whole, even at the narrowest pane with notes pending', async ($, on) => {
    const pending = [
      { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 },
      { id: 'c2', path: 'a.ts', text: 'fix that', status: 'pending', createdAt: 0 },
    ]
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: pending }, null)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, bodyColumns: 38 },
      requestId: DIFF_PANE.id,
    })

    await ui.press({ key: 'clear' })

    expect(await ui.find({ key: 'previous' })).toBeUndefined()
    expect(await ui.find({ key: 'next' })).toBeUndefined()
    expect(await ui.find({ key: 'refresh' })).toBeUndefined()

    const row = await ui.find({ key: ACTIONS_ROW_KEY })
    expect(row?.text).toContain('clear all?')
    // `.text` is the row's whole drawn content with no clipping applied by this harness, so its
    // length is the real proxy for "does this actually fit" — same convention as the hunk
    // toolbar's own narrowest-pane test.
    expect(row?.text?.length ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(38)
  })

  test('with nothing armed, the map and the notes summary degrade instead of vanishing at the narrowest docked pane (R28)', async ($, on) => {
    // `.text` flattens every Button down to its bare label, dropping the `[ ]` bracket padding
    // and the row's own gaps — that is why the other narrowest-pane tests' ".text.length <= 38"
    // proxy cannot catch this bug: the change map and notes summary were being starved to
    // nothing *before* `.text` is ever computed, by the actual flex layout (the chips' box is
    // `flexShrink: 0`, so a too-wide chip row shrinks the map/summary box instead, down to 0 if
    // it has to), not by anything `.text` reflects. `drawnWidth` below walks the raw element
    // tree and reconstructs each node's real drawn width (a `Button`'s own `[ label ]` bracket
    // padding, a row `Box`'s `gap` between children) so the assertion actually exercises the
    // thing that broke live (see .scratch/p2-6-narrow.txt).
    const files = Array.from({ length: 5 }, (_, i) => `f${i}.ts`)
    const pending = [
      { id: 'c1', path: 'f0.ts', text: 'fix this', status: 'pending', createdAt: 0 },
      { id: 'c2', path: 'f0.ts', text: 'fix that', status: 'pending', createdAt: 0 },
    ]
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: pending }, null, files)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, bodyColumns: 38 },
      requestId: DIFF_PANE.id,
    })

    const row = await ui.find({ key: ACTIONS_ROW_KEY })
    const mapGlyphs = (row?.text ?? '').match(/[▁▂▃▄▅▆▇█…]/g) ?? []
    // `MIN_MAP_CELLS` is `2`, not `3` (ruling R30: nav no longer gives way to make room, so one
    // more cell has to) — 5 files over that cap draw one bar glyph plus the dim `…` overflow cell.
    expect(mapGlyphs.length).toBeGreaterThanOrEqual(2)
    // The compact summary is a bare `✎` here, not `✎2` (fix round 2): `send N` right next to it
    // already carries the count, and at 10+ pending `✎10` was the one character the arithmetic
    // couldn't afford once nav stopped giving way (ruling R30) — see the test below.
    expect(row?.text).toMatch(/✎|✎ 2 notes pending/)
    expect(drawnWidth(row)).toBeLessThanOrEqual(38)
  })

  test('the compact notes summary stays a bare ✎ at 10+ pending, where a digit would overflow 38 columns', async ($, on) => {
    // Live-measured (fix round 2): with nav never giving way (R30) the row's own floor is tight
    // enough that `✎10` (2 digits) pushed drawnWidth to 40 before this fix — `send N` already
    // carries the exact count, so the summary doesn't need to repeat it.
    const files = Array.from({ length: 5 }, (_, i) => `f${i}.ts`)
    const pending = Array.from({ length: 10 }, (_, i) => ({
      id: `c${i}`,
      path: 'f0.ts',
      text: 'fix this',
      status: 'pending' as const,
      createdAt: 0,
    }))
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: pending }, null, files)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, bodyColumns: 38 },
      requestId: DIFF_PANE.id,
    })

    const row = await ui.find({ key: ACTIONS_ROW_KEY })
    expect(row?.text).not.toContain('✎10')
    expect((await ui.find({ key: 'send' }))?.text).toContain('➤ 10')
    expect(drawnWidth(row)).toBeLessThanOrEqual(38)
  })

  test('the list chords keep working at the narrowest docked pane: nav never gives way (R30)', async ($, on) => {
    // Same narrow-pane shape as the R28 test above. Ruling R30 (fix round 2): a live tmux probe
    // showed a Tab ring walking onto a `display: "none"` Button with no visible focus mark — the
    // engine's `ButtonProps` has no way to make a mounted chip unreachable by Tab — so nav instead
    // stays fully visible (not hidden, not dropped) at every width; `MIN_MAP_CELLS` above absorbs
    // the cost. Asserts both halves: the Buttons carry their chord actions, and they actually draw
    // (non-empty text, not a zero-width `display: "none"` stand-in), while the row still fits 38.
    const files = Array.from({ length: 5 }, (_, i) => `f${i}.ts`)
    const pending = [
      { id: 'c1', path: 'f0.ts', text: 'fix this', status: 'pending', createdAt: 0 },
      { id: 'c2', path: 'f0.ts', text: 'fix that', status: 'pending', createdAt: 0 },
    ]
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: pending }, null, files)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, bodyColumns: 38 },
      requestId: DIFF_PANE.id,
    })

    const previous = await ui.find({ key: 'previous' })
    const next = await ui.find({ key: 'next' })
    expect(previous?.props.action).toBe('app:diffFileListUp')
    expect(next?.props.action).toBe('app:diffFileListDown')
    expect(previous?.text).toBe('↑')
    expect(next?.text).toBe('↓')

    const row = await ui.find({ key: ACTIONS_ROW_KEY })
    // Independent of the width arithmetic below: a `display: "none"` wrapper (ruling R30's first,
    // abandoned fix) would still measure 0 and could pass `drawnWidth <= 38` by accident.
    expect(anyDisplayNone(row)).toBe(false)
    expect(drawnWidth(row)).toBeLessThanOrEqual(38)
  })

  test('the file heading carries a right-aligned "✎ note" chip, keyed to its own path', async ($, on) => {
    gitWorld(on, {}, null)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    expect((await ui.find({ key: commentButtonKeyOf({ path: 'a.ts' }) }))?.text).toContain('✎ note')
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

describe('turn.complete resets the live feed on every reason', () => {
  test('an aborted turn still clears the edited marks, not just an answered one', async ($, on) => {
    gitWorld(on, {}, null, ['a.ts', 'b.ts'])
    on('tool.call', { tool: 'Edit' }, () => ({ result: {} }))
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.tool.call({ tool: 'Edit', file_path: '/work/b.ts', old_string: 'a', new_string: 'b' })

    const ui = await mountDiff($)
    expect((await ui.find({ key: 'row:b.ts' }))?.text).toContain('◉')

    await $.turn.complete({ ...mainLoopTurn('done'), reason: 'aborted' })
    expect((await ui.find({ key: 'row:b.ts' }))?.text).not.toContain('◉')
  })

  test('an aborted turn does not fork to resolve sent comments', async ($, on) => {
    const sent = { id: 'c5', path: 'a.ts', text: 'fix this', status: 'sent', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [sent] }, '["c5"]')

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.turn.complete({ ...mainLoopTurn('done'), reason: 'aborted' })

    const ui = await mountDiff($)
    expect(await ui.find({ text: /addressed/ })).toBeUndefined()
    expect(await ui.find({ text: /fix this/ })).toBeDefined()
  })
})

const HUNK_HEADER = '@@ -1,2 +1,2 @@'
const TOOLBAR_KEY = hunkHeaderKeyOf({ path: 'a.ts', hunk: HUNK_HEADER })
const HUNK_TEXT = `${HUNK_HEADER}\n a\n-b\n+c\n`

/** A world inside a git repo with one file carrying one hunk, so stage/revert have something to act on. */
function hunkWorld(
  on: On,
  onApply: (argv: readonly string[], stdin: string | undefined) => void,
  diffTextOf: () => string = () => HUNK_TEXT,
  path = 'a.ts',
  storeEntries: Record<string, unknown> = {},
) {
  baseWorld(on, storeEntries)
  on('process.run', ($, e) => {
    const [cmd, sub] = e.argv
    if (cmd === 'git' && sub === 'rev-parse') return ran(0, REPO)
    if (cmd === 'git' && sub === 'status') return ran(0, ` M ${path}\0`)
    if (cmd === 'git' && e.argv.includes('--numstat')) return ran(0, `1\t1\t${path}\0`)
    if (cmd === 'git' && sub === 'apply') {
      onApply(e.argv, e.init?.stdin)
      return ran(0)
    }
    // The all-files bulk diff `loadAllHunks` issues (refresh): a real multi-file diff, sectioned
    // by `diff --git` lines, so `diffSectionsOf` can find the file's section.
    if (cmd === 'git' && e.argv.includes('-c')) {
      return ran(0, `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${diffTextOf()}`)
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
    await ui.post({ press: stageKeyOf({ path: 'a.ts', hunk: HUNK_HEADER }) }, { in: TOOLBAR_KEY })

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

    await ui.post({ press: stageKeyOf({ path: 'a.ts', hunk: HUNK_HEADER }) }, { in: TOOLBAR_KEY })

    expect(applyRan).toBe(false)
    expect(toasts).toContain('The hunk changed — refreshed, try again')
  })

  test('a hunk toolbar draws a Client whose props carry the note, stage and revert pills, in words at the default 100-column pane', async ($, on) => {
    hunkWorld(on, () => {})

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    const client = await ui.find({ key: TOOLBAR_KEY })
    expect(client?.type).toBe('Client')
    const props = client?.props.props as { rows: StripRowOf[] }
    const right = props.rows[0]?.right ?? []
    expect(right.filter(seg => seg.id).map(seg => seg.id)).toEqual([
      commentButtonKeyOf({ path: 'a.ts', hunk: HUNK_HEADER }),
      stageKeyOf({ path: 'a.ts', hunk: HUNK_HEADER }),
      revertKeyOf({ path: 'a.ts', hunk: HUNK_HEADER }),
    ])
    // What the surface module drew: no square brackets, the labels in words.
    const text = (await ui.find({ in: TOOLBAR_KEY, type: 'Box' }))?.text ?? ''
    expect(text).toContain('✎ note')
    expect(text).toContain('✓ stage')
    expect(text).toContain('↺ revert')
    expect(text).not.toMatch(/[[\]]/)
  })

  test('a hunk toolbar still draws its pills when the path and header push the key past 64 characters', async ($, on) => {
    // A real repo's path plus a git header carrying a function-context suffix routinely does this.
    const path = `src/${'nested/'.repeat(10)}File.kt`
    const header = `@@ -1,2 +1,2 @@ ${'x'.repeat(60)}`
    const diffText = `${header}\n a\n-b\n+c\n`
    hunkWorld(
      on,
      () => {},
      () => diffText,
      path,
    )

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    const key = hunkHeaderKeyOf({ path, hunk: header })
    expect((await ui.find({ in: key, text: '✓ stage' }))?.text).toContain('✓ stage')
  })

  test('after staging, the stage pill reads "✓ staged"', async ($, on) => {
    hunkWorld(on, () => {})

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    await ui.post({ press: stageKeyOf({ path: 'a.ts', hunk: HUNK_HEADER }) }, { in: TOOLBAR_KEY })

    expect(await ui.find({ in: TOOLBAR_KEY, text: '✓ staged' })).toBeDefined()
  })

  test('the pointer lights the pill under it and a left click on it stages the hunk', async ($, on) => {
    const applied: { argv?: readonly string[] } = {}
    hunkWorld(on, argv => {
      applied.argv = argv
    })

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    await ui.resize({ columns: 60, rows: 1, in: TOOLBAR_KEY })
    const bgOf = async () =>
      (await ui.find({ in: TOOLBAR_KEY, type: 'Text', text: '✓ stage' }))?.props.backgroundColor
    expect(await bgOf()).toBe('userMessageBackground')

    // Right-aligned pills: ` ✎ note ` (8) ` ` ` ✓ stage ` (9) ` ` ` ↺ revert ` (10) end at column 60,
    // so stage spans columns 40..48.
    await ui.pointer({ type: 'move', x: 44, y: 0, in: TOOLBAR_KEY })
    expect(await bgOf()).toBe('userMessageBackgroundHover')
    await ui.pointer({ type: 'move', x: 10, y: 0, in: TOOLBAR_KEY })
    expect(await bgOf()).toBe('userMessageBackground')

    await ui.pointer({ type: 'down', x: 44, y: 0, button: 'left', in: TOOLBAR_KEY })
    expect(applied.argv).toEqual(['git', 'apply', '--cached', '--recount', '-'])
  })

  test('a press the last render no longer draws is ignored', async ($, on) => {
    hunkWorld(on, () => {})

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    await ui.post({ press: 'stage:gone.ts|@@' }, { in: TOOLBAR_KEY })
    await ui.post({ nonsense: 1 }, { in: TOOLBAR_KEY })

    expect(await ui.find({ in: TOOLBAR_KEY, text: '✓ stage' })).toBeDefined()
  })

  test('revert is armed by one press and confirmed by the second, the armed pill keeping its words', async ($, on) => {
    const applied: (readonly string[])[] = []
    hunkWorld(on, argv => {
      applied.push(argv)
    })

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    const revert = revertKeyOf({ path: 'a.ts', hunk: HUNK_HEADER })
    await ui.post({ press: revert }, { in: TOOLBAR_KEY })
    expect(await ui.find({ in: TOOLBAR_KEY, text: '↺ sure?' })).toBeDefined()
    expect(applied).toHaveLength(0)

    await ui.post({ press: revert }, { in: TOOLBAR_KEY })
    expect(applied.map(argv => argv.join(' '))).toContain('git apply -R --recount -')
  })

  test('the armed revert confirm fits the narrowest docked pane, shrinking the toolbar to icons', async ($, on) => {
    hunkWorld(on, () => {})

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, bodyColumns: 38 },
      requestId: DIFF_PANE.id,
    })
    const anchor = { path: 'a.ts', hunk: HUNK_HEADER }
    await ui.post({ press: revertKeyOf(anchor) }, { in: TOOLBAR_KEY })

    const props = (await ui.find({ key: TOOLBAR_KEY }))?.props.props as { rows: StripRowOf[] }
    const segs = props.rows[0]?.right ?? []
    const right = segs.map(seg => seg.t).join('')
    expect(right).toContain('↺ sure?')
    expect(right).not.toContain('note')
    // 38 minus the card's three edge columns (the 2-column rail and the toolbar's own 1-column
    // indent) leaves 35 for the toolbar: its label and pills share it.
    expect(right.length).toBeLessThanOrEqual(35)
  })

  for (const surface of ['vscode', 'mobile'] as const) {
    test(`on ${surface} the toolbar falls back to plain Buttons with no brackets, and pressing them works`, async ($, on) => {
      const applied: { argv?: readonly string[] } = {}
      hunkWorld(on, argv => {
        applied.argv = argv
      })

      await $.session.start(SESSION)
      await $.command.run(ravenCommand('diff'))

      const ui = await $.ui.mount({
        plugin: NAME,
        surface,
        component: 'Pane',
        props: PANE_PROPS,
        requestId: DIFF_PANE.id,
      })
      const row = await ui.find({ key: TOOLBAR_KEY })
      expect(row?.type).toBe('Box')
      expect(row?.text).toContain('stage')
      expect(row?.text).toContain('revert')
      expect(row?.text).not.toMatch(/[[\]]/)
      expect(await ui.findAll({ type: 'Client' })).toHaveLength(0)

      const stage = await ui.find({ key: stageKeyOf({ path: 'a.ts', hunk: HUNK_HEADER }) })
      expect(stage?.type).toBe('Button')
      await ui.press({ key: stageKeyOf({ path: 'a.ts', hunk: HUNK_HEADER }) })
      expect(applied.argv).toEqual(['git', 'apply', '--cached', '--recount', '-'])
      expect(await ui.find({ text: '✓ staged' })).toBeDefined()
    })
  }

  const SECOND_HUNK_HEADER = '@@ -10,2 +10,2 @@'
  const TWO_HUNK_TEXT = `${HUNK_TEXT}${SECOND_HUNK_HEADER}\n x\n-y\n+z\n`

  test("no row draws between a file's two hunks (a later task adds a hunk context row there)", async ($, on) => {
    hunkWorld(
      on,
      () => {},
      () => TWO_HUNK_TEXT,
    )

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    expect(await ui.find({ key: 'a.ts#gap:1' })).toBeUndefined()
    expect(await ui.find({ key: `a.ts#hunk:1:${SECOND_HUNK_HEADER}` })).toBeDefined()
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

describe('the Files tree', () => {
  test('a changed file carries its status dot', async ($, on) => {
    gitWorld(on, {}, null, ['src/a.ts'])

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('files'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: PANE_PROPS,
      requestId: TREE_PANE.id,
    })
    const row = await ui.find({ key: 'file:src/a.ts' })
    expect(row?.text).toContain('a.ts')
    expect(row?.text).toContain('●')
  })

  test('an untracked and an added file keep their own status letters, not just the same-coloured dot', async ($, on) => {
    baseWorld(on)
    on('session.messages', () => ({ value: [] }))
    on('process.run', ($, e) => {
      const [cmd, sub] = e.argv
      if (cmd === 'git' && sub === 'rev-parse' && e.argv.includes('--show-toplevel')) {
        return ran(0, REPO)
      }
      if (cmd === 'git' && sub === 'status') return ran(0, '?? new.ts\0A  added.ts\0')
      if (cmd === 'git' && sub === 'ls-files') return ran(0, 'new.ts\0added.ts\0')
      return ran(1)
    })
    trackShownPanes(on)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('files'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: PANE_PROPS,
      requestId: TREE_PANE.id,
    })
    expect((await ui.find({ key: 'file:new.ts' }))?.text).toContain('U')
    expect((await ui.find({ key: 'file:added.ts' }))?.text).toContain('A')
  })
})

describe('the AbovePrompt status band', () => {
  test('shows pending comments when no Raven pane is open', async ($, on) => {
    const pending = { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [pending] }, null)

    await $.session.start(SESSION)

    const ui = await mountBand($)
    expect(await ui.find({ text: /notes? pending/ })).toBeDefined()
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

  test('draws a coloured dot before the name, and open/send as chips, send primary', async ($, on) => {
    const pending = { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [pending] }, null)

    await $.session.start(SESSION)

    const ui = await mountBand($)
    expect(await ui.find({ text: '●' })).toBeDefined()
    const open = await ui.find({ key: 'band:open' })
    expect(open?.type).toBe('Button')
    const send = await ui.find({ key: 'band:send' })
    expect(send?.type).toBe('Button')
    expect(send?.props.variant).toBe('primary')
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
  function promptWorld(
    on: On,
    comments: readonly unknown[],
    respond: (text: string) => { text: string } | { drop: string } = text => ({ text }),
    // Which paths the batched existence check (R32) reports present; defaults to `['a.ts']`
    // (gitWorld's own default `files`), so a path left out — like `gone.ts` — reads as gone.
    existing: readonly string[] = ['a.ts'],
  ) {
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: comments }, null, ['a.ts'], [], [], existing)
    const toasts: string[] = []
    on('ui.toast', ($, e) => {
      toasts.push(e.text)
      return { value: undefined }
    })
    on('prompt.submit', ($, e) => respond(e.text))
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

  test('a pending comment on a file that no longer exists (deleted) opens instead of riding', async ($, on) => {
    const toasts = promptWorld(on, [
      { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 },
      { id: 'c2', path: 'gone.ts', text: 'stale', status: 'pending', createdAt: 1 },
    ])
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
    expect(toasts).toContain('Raven: 1 review comment sent with this prompt')
  })

  test('a pending comment on a file no longer in the diff but still on disk still rides (R32)', async ($, on) => {
    const toasts = promptWorld(
      on,
      [
        { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 },
        { id: 'c2', path: 'b.ts', text: 'still relevant', status: 'pending', createdAt: 1 },
      ],
      undefined,
      ['a.ts', 'b.ts'],
    )
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
    expect(toasts).toContain('Raven: 2 review comments sent with this prompt')
  })

  test('a doc comment always rides, even once the diff has loaded', async ($, on) => {
    const toasts = promptWorld(on, [
      { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 },
      {
        id: 'c2',
        path: '/work/README.md',
        section: '(top)',
        text: 'doc note',
        status: 'pending',
        createdAt: 1,
      },
    ])
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
    expect(toasts).toContain('Raven: 2 review comments sent with this prompt')
  })

  test('before the diff ever loads, every pending comment rides', async ($, on) => {
    const toasts = promptWorld(on, [
      { id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 },
      { id: 'c2', path: 'gone.ts', text: 'stale', status: 'pending', createdAt: 1 },
    ])
    await $.session.start(SESSION)
    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
    expect(toasts).toContain('Raven: 2 review comments sent with this prompt')
  })

  test('a dropped prompt does not toast, and the carried comment rides the next one', async ($, on) => {
    let shouldDrop = true
    const toasts = promptWorld(
      on,
      [{ id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 }],
      text => (shouldDrop ? { drop: 'queued behind the running turn' } : { text }),
    )
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
    expect(toasts.filter(text => text.includes('review comment'))).toEqual([])

    shouldDrop = false
    await $.prompt.submit({ text: 'hello again', origin: { kind: 'composer' }, wait: false })
    expect(toasts).toContain('Raven: 1 review comment sent with this prompt')
  })

  test('a rejected next() restores the carried comment without a toast', async ($, on) => {
    let shouldThrow = true
    const toasts = promptWorld(
      on,
      [{ id: 'c1', path: 'a.ts', text: 'fix this', status: 'pending', createdAt: 0 }],
      text => {
        if (shouldThrow) throw new Error('boom')
        return { text }
      },
    )
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    let threw = false
    try {
      await $.prompt.submit({ text: 'hello', origin: { kind: 'composer' }, wait: false })
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
    expect(toasts.filter(text => text.includes('review comment'))).toEqual([])

    shouldThrow = false
    await $.prompt.submit({ text: 'hello again', origin: { kind: 'composer' }, wait: false })
    expect(toasts).toContain('Raven: 1 review comment sent with this prompt')
  })
})

describe('a note is a card (R38)', () => {
  const LONG = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ') // ~210 chars
  const card = (patch: Record<string, unknown>) => ({
    id: 'c1',
    path: 'a.ts',
    text: LONG,
    status: 'pending',
    createdAt: 0,
    ...patch,
  })

  test('a long comment draws on several rows, every word up to the cut present, none past the pane', async ($, on) => {
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [card({})] }, null)
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    const ui = await mountDiff($)

    const first = await ui.find({ key: noteKeyOf('c1') })
    expect(first?.text).toContain('word0')
    expect(first?.text).toContain('pending')
    const rest: string[] = []
    for (let i = 0; i < 5; i += 1) {
      const line = await ui.find({ key: `${noteKeyOf('c1')}:${i}` })
      if (line) rest.push(line.text)
    }
    expect(rest.length).toBeGreaterThan(0)
    expect(rest.every(line => line.length <= PANE_PROPS.bodyColumns - 3)).toBe(true)
    const drawn = `${first?.text} ${rest.join(' ')}`
    // The whole comment fits in six rows here, so every word is drawn.
    for (let i = 0; i < 30; i += 1) expect(drawn).toContain(`word${i}`)
  })

  test('an overlong comment is cut at six rows with an ellipsis', async ($, on) => {
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [card({ text: 'lorem '.repeat(300) })] }, null)
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    const ui = await mountDiff($)
    const last = await ui.find({ key: `${noteKeyOf('c1')}:4` })
    expect(last?.text.endsWith('…')).toBe(true)
    expect(await ui.find({ key: `${noteKeyOf('c1')}:5` })).toBeUndefined()
  })

  test('the status shows as a word: pending on a fresh note, open once it has opened', async ($, on) => {
    gitWorld(
      on,
      { [commentsStoreKeyOf(REPO)]: [card({ id: 'o1', status: 'open', text: 'reopened' })] },
      null,
    )
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    const ui = await mountDiff($)

    expect((await ui.find({ key: noteKeyOf('o1') }))?.text).toContain('open')
    await ui.press({ key: commentButtonKeyOf({ path: 'a.ts' }) })
    await ui.input({ key: inputKeyOf({ path: 'a.ts' }), text: 'fresh one' })
    expect(await ui.find({ text: /pending/ })).toBeDefined()
  })

  test('composing shows a real cancel chip; pressing it closes the box', async ($, on) => {
    gitWorld(on, {}, null)
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    const ui = await mountDiff($)

    const anchor = { path: 'a.ts' }
    await ui.press({ key: commentButtonKeyOf(anchor) })
    expect(await ui.find({ key: cancelKeyOf(anchor) })).toBeDefined()
    expect(await ui.find({ text: /⏎ add/ })).toBeDefined()
    expect(await ui.find({ text: /cancel/ })).toBeDefined()

    await ui.press({ key: cancelKeyOf(anchor) })
    expect(await ui.find({ key: cancelKeyOf(anchor) })).toBeUndefined()
  })

  test("the Doc pane's section note is the same card", async ($, on) => {
    const docPath = '/work/docs/superpowers/plans/x.md'
    openWorld(on, { [docPath]: '# Plan\n\nIntro\n' })
    await $.session.start(SESSION)
    await $.tool.call(editOf(docPath))
    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'terminal',
      component: 'Pane',
      props: { ...PANE_PROPS, title: 'Doc' },
      requestId: DOC_PANE.id,
    })
    const section = { path: docPath, hunk: '§0' }
    await ui.press({ key: commentButtonKeyOf(section) })
    await ui.input({ key: inputKeyOf(section), text: 'doc card note' })
    expect(await ui.find({ text: /pending/ })).toBeDefined()
  })
})

describe('inline line threads (R39)', () => {
  const header = '@@ -1,8 +1,8 @@'
  const text = `${header}\n l1\n l2\n l3\n l4\n l5\n-old6\n+new6\n l7\n l8\n`
  const onLine6 = {
    id: 'c1',
    path: 'a.ts',
    hunk: header,
    line: { number: 6, side: 'new', text: 'new6' },
    text: 'inline remark',
    status: 'pending',
    createdAt: 0,
  }

  test('a note on a line draws between that line and the next, its rail cell a ◆', async ($, on) => {
    hunkWorld(
      on,
      () => {},
      () => text,
      'a.ts',
      { [commentsStoreKeyOf(REPO)]: [onLine6] },
    )
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    const ui = await mountDiff($)

    const drawn = (await ui.find({ key: noteKeyOf('c1') }))?.text
    expect(drawn).toContain('inline remark')
    const all = (await ui.find({ text: /new6/ }))?.text ?? ''
    expect(all.indexOf('new6')).toBeGreaterThan(-1)
    expect(all.indexOf('inline remark')).toBeGreaterThan(all.indexOf('new6'))
    expect(all.indexOf('inline remark')).toBeLessThan(all.indexOf('l7'))
    expect(all).toContain('◆')
    expect(all.indexOf('◆')).toBeLessThan(all.indexOf('inline remark'))
  })

  test('a note whose line is not in the hunk draws after the hunk, with no ◆', async ($, on) => {
    const stray = { ...onLine6, line: { number: 99, side: 'new', text: '' } }
    hunkWorld(
      on,
      () => {},
      () => text,
      'a.ts',
      { [commentsStoreKeyOf(REPO)]: [stray] },
    )
    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))
    const ui = await mountDiff($)
    const all = (await ui.find({ text: /new6/ }))?.text ?? ''
    expect(all.indexOf('inline remark')).toBeGreaterThan(all.indexOf('l8'))
    expect(all).not.toContain('◆')
  })
})

describe('comments outside the stream (R32)', () => {
  test('an open comment on a deleted file shows under "Not in this diff" with a working ✕', async ($, on) => {
    const open = { id: 'c1', path: 'gone.ts', text: 'stale note', status: 'open', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [open] }, null, ['a.ts'])

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    expect(await ui.find({ text: 'Not in this diff' })).toBeDefined()
    expect(await ui.find({ text: 'gone.ts' })).toBeDefined()
    expect(await ui.find({ text: 'file gone' })).toBeDefined()

    await ui.press({ key: dropKeyOf('c1') })

    expect(await ui.find({ text: 'Not in this diff' })).toBeUndefined()
  })

  test('an orphan still draws when there are zero files in the diff', async ($, on) => {
    const open = { id: 'c1', path: 'gone.ts', text: 'stale note', status: 'open', createdAt: 0 }
    gitWorld(on, { [commentsStoreKeyOf(REPO)]: [open] }, null, [])

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await mountDiff($)
    expect(await ui.find({ text: 'Not in this diff' })).toBeDefined()
  })
})

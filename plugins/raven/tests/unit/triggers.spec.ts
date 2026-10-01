import { describe, expect, test } from 'bun:test'
import { DEFAULT_SETTINGS } from '../../hooks/core/settings'
import { actionsOf, planActionsOf, type ToolEvent, triggersOf } from '../../hooks/core/triggers'

const editOf = (path: string): ToolEvent => ({
  tool: 'Write',
  input: { file_path: path },
  isLanded: true,
})

const actionsWith = (settings = DEFAULT_SETTINGS) => {
  const triggers = triggersOf(settings)
  return (event: ToolEvent) => actionsOf(event, triggers)
}

describe('actionsOf watched-doc paths', () => {
  test('a built-in path opens the doc view regardless of settings', () => {
    const actions = actionsWith()(editOf('/repo/docs/superpowers/plans/x.md'))
    expect(actions).toContainEqual({ kind: 'show-doc', path: '/repo/docs/superpowers/plans/x.md' })
  })

  test('an unrelated markdown file does not open the doc view by default', () => {
    const actions = actionsWith()(editOf('/repo/notes/x.md'))
    expect(actions).not.toContainEqual({ kind: 'show-doc', path: '/repo/notes/x.md' })
  })

  test('a configured fragment opens its markdown', () => {
    const settings = { ...DEFAULT_SETTINGS, watchedPaths: ['notes/'] }
    const actions = actionsWith(settings)(editOf('/repo/notes/x.md'))
    expect(actions).toContainEqual({ kind: 'show-doc', path: '/repo/notes/x.md' })
  })

  test('a fragment only matches a `/`-bounded segment, not a substring of another', () => {
    const settings = { ...DEFAULT_SETTINGS, watchedPaths: ['notes'] }
    const actions = actionsWith(settings)(editOf('/repo/footnotes/x.md'))
    expect(actions).not.toContainEqual({ kind: 'show-doc', path: '/repo/footnotes/x.md' })
  })

  test('a configured fragment never opens a non-markdown file', () => {
    const settings = { ...DEFAULT_SETTINGS, watchedPaths: ['notes/'] }
    const actions = actionsWith(settings)(editOf('/repo/notes/x.txt'))
    expect(actions).not.toContainEqual({ kind: 'show-doc', path: '/repo/notes/x.txt' })
  })

  test('a single-segment fragment does not match a longer segment that merely starts with it', () => {
    const settings = { ...DEFAULT_SETTINGS, watchedPaths: ['docs'] }
    const actions = actionsWith(settings)(editOf('/foo/docsystem/x.md'))
    expect(actions).not.toContainEqual({ kind: 'show-doc', path: '/foo/docsystem/x.md' })
  })

  test('a single-segment fragment matches its own segment', () => {
    const settings = { ...DEFAULT_SETTINGS, watchedPaths: ['docs'] }
    const actions = actionsWith(settings)(editOf('/foo/docs/x.md'))
    expect(actions).toContainEqual({ kind: 'show-doc', path: '/foo/docs/x.md' })
  })

  test('a multi-segment fragment matches across contiguous segments', () => {
    const settings = { ...DEFAULT_SETTINGS, watchedPaths: ['notes/drafts'] }
    const actions = actionsWith(settings)(editOf('/r/notes/drafts/x.md'))
    expect(actions).toContainEqual({ kind: 'show-doc', path: '/r/notes/drafts/x.md' })
  })

  test('a multi-segment fragment does not match a segment that only starts with its tail', () => {
    const settings = { ...DEFAULT_SETTINGS, watchedPaths: ['notes/drafts'] }
    const actions = actionsWith(settings)(editOf('/r/notes/draftsx/x.md'))
    expect(actions).not.toContainEqual({ kind: 'show-doc', path: '/r/notes/draftsx/x.md' })
  })
})

describe('actionsOf main-loop-edit', () => {
  test('a main-loop edit always raises the action; gating is the controller’s job', () => {
    const actions = actionsWith()(editOf('/repo/a.ts'))
    expect(actions).toContainEqual({ kind: 'main-loop-edit' })
  })

  test('a subagent’s edit never raises it', () => {
    const actions = actionsWith()({ ...editOf('/repo/a.ts'), agentId: 'sub-1' })
    expect(actions).not.toContainEqual({ kind: 'main-loop-edit' })
  })
})

describe('plan files', () => {
  const PLAN = '/home/u/.claude/plans/x.md'

  test('a plans-folder path is not guessed', () => {
    expect(actionsWith()(editOf(PLAN))).not.toContainEqual({ kind: 'show-doc', path: PLAN })
  })

  test('a plan path plan mode named shows as it is written', () => {
    const actions = actionsOf(editOf(PLAN), triggersOf(DEFAULT_SETTINGS), new Set([PLAN]))
    expect(actions).toContainEqual({ kind: 'show-doc', path: PLAN })
  })

  test('the planning reminder only teaches the path', () => {
    expect(planActionsOf({ type: 'plan_mode', planFilePath: PLAN, hasPlan: true })).toEqual([])
  })

  test('leaving plan mode opens the plan when there is one', () => {
    expect(planActionsOf({ type: 'plan_mode_exit', planFilePath: PLAN, hasPlan: true })).toEqual([
      { kind: 'show-doc', path: PLAN },
    ])
    expect(planActionsOf({ type: 'plan_mode_exit', planFilePath: PLAN, hasPlan: false })).toEqual(
      [],
    )
  })

  test('re-entering plan mode opens the earlier plan', () => {
    expect(planActionsOf({ type: 'plan_mode_reentry', planFilePath: PLAN })).toEqual([
      { kind: 'show-doc', path: PLAN },
    ])
  })
})

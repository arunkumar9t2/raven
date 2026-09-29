import { describe, expect, test } from 'bun:test'
import { DEFAULT_SETTINGS } from '../../hooks/core/settings'
import { actionsOf, type ToolEvent } from '../../hooks/core/triggers'

const editOf = (path: string): ToolEvent => ({
  tool: 'Write',
  input: { file_path: path },
  isLanded: true,
})

describe('actionsOf watched-doc paths', () => {
  test('a built-in path opens the doc view regardless of settings', () => {
    const actions = actionsOf(editOf('/repo/docs/superpowers/plans/x.md'), DEFAULT_SETTINGS)
    expect(actions).toContainEqual({ kind: 'show-doc', path: '/repo/docs/superpowers/plans/x.md' })
  })

  test('an unrelated markdown file does not open the doc view by default', () => {
    const actions = actionsOf(editOf('/repo/notes/x.md'), DEFAULT_SETTINGS)
    expect(actions).not.toContainEqual({ kind: 'show-doc', path: '/repo/notes/x.md' })
  })

  test('a configured fragment opens its markdown', () => {
    const settings = { ...DEFAULT_SETTINGS, watchedPaths: ['notes/'] }
    const actions = actionsOf(editOf('/repo/notes/x.md'), settings)
    expect(actions).toContainEqual({ kind: 'show-doc', path: '/repo/notes/x.md' })
  })

  test('a fragment only matches a `/`-bounded segment, not a substring of another', () => {
    const settings = { ...DEFAULT_SETTINGS, watchedPaths: ['notes'] }
    const actions = actionsOf(editOf('/repo/footnotes/x.md'), settings)
    expect(actions).not.toContainEqual({ kind: 'show-doc', path: '/repo/footnotes/x.md' })
  })

  test('a configured fragment never opens a non-markdown file', () => {
    const settings = { ...DEFAULT_SETTINGS, watchedPaths: ['notes/'] }
    const actions = actionsOf(editOf('/repo/notes/x.txt'), settings)
    expect(actions).not.toContainEqual({ kind: 'show-doc', path: '/repo/notes/x.txt' })
  })
})

describe('actionsOf main-loop-edit', () => {
  test('a main-loop edit always raises the action; gating is the controller’s job', () => {
    const actions = actionsOf(editOf('/repo/a.ts'), DEFAULT_SETTINGS)
    expect(actions).toContainEqual({ kind: 'main-loop-edit' })
  })

  test('a subagent’s edit never raises it', () => {
    const actions = actionsOf({ ...editOf('/repo/a.ts'), agentId: 'sub-1' }, DEFAULT_SETTINGS)
    expect(actions).not.toContainEqual({ kind: 'main-loop-edit' })
  })
})

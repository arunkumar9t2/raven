import { describe, expect, test } from 'bun:test'
import type { SessionMessage } from 'claude-code'
import type { Host, RunResult } from '../../hooks/core/host'
import { turnValueOf } from '../../hooks/views/diff/source'
import { createSourceController } from '../../hooks/views/diff/source-controller'

type ToolUse = SessionMessage['toolUses'][number]

const promptRow = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })

const useOf = (tool: string, input: Record<string, unknown>): ToolUse => ({
  tool_use_id: `${tool}-1`,
  tool,
  input,
})

const assistantRow = (toolUses: ToolUse[]): SessionMessage => ({
  role: 'assistant',
  text: '',
  toolUses,
})

const turnMessages: SessionMessage[] = [
  promptRow('edit a file'),
  assistantRow([useOf('Edit', { file_path: '/r/a.ts', old_string: 'a', new_string: 'b' })]),
]

function fakeHost(overrides: Partial<Host> = {}): Host {
  const store = new Map<string, unknown>()
  const run = async (): Promise<RunResult> => ({ exitCode: 0, stdout: 'deadbeef', stderr: '' })
  return {
    run,
    readFile: async () => '',
    after: () => ({ cancel: () => {} }),
    redraw: () => {},
    openPane: async () => true,
    closePane: async () => {},
    isShown: async () => true,
    shownPaneIds: async () => new Set(),
    focus: async () => {},
    storeGet: async key => store.get(key),
    storeSet: async (key, value) => {
      store.set(key, value)
    },
    submitPrompt: async () => {},
    cwd: async () => '/repo',
    fork: async () => null,
    status: () => {},
    fillPrompt: async () => ({ isFilled: true }),
    toast: () => {},
    messages: async () => turnMessages,
    debug: () => {},
    readGlobalConfig: async () => null,
    isCheckpointing: async () => true,
    ...overrides,
  }
}

const repository = { toplevel: '/repo', files: [] }

describe('createSourceController', () => {
  test('files() returns the same object across calls for a turn source', async () => {
    const controller = createSourceController(fakeHost())
    await controller.refresh(repository)

    controller.select(turnValueOf(1))
    const first = controller.files(repository)
    const second = controller.files(repository)

    expect(first).toBe(second)
    expect(first[0]).toBe(second[0])
  })

  test('hunksFor() returns the same array across calls for a turn source', async () => {
    const controller = createSourceController(fakeHost())
    await controller.refresh(repository)
    controller.select(turnValueOf(1))

    const file = controller.files(repository)[0]
    if (!file) throw new Error('expected a turn file')
    expect(controller.hunksFor(file)).toBe(controller.hunksFor(file))
  })

  test('options() is reused when branch point presence and turns are unchanged', async () => {
    const controller = createSourceController(fakeHost())
    await controller.refresh(repository)

    const first = controller.options()
    const second = controller.options()
    expect(first).toBe(second)
  })

  test('options() is recomputed once turns change', async () => {
    let messages: readonly SessionMessage[] = []
    const controller = createSourceController(fakeHost({ messages: async () => messages }))
    await controller.refresh(repository)
    const before = controller.options()

    messages = turnMessages
    await controller.refresh(repository)
    const after = controller.options()

    expect(after).not.toBe(before)
  })
})

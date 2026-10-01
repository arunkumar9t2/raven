import type { Host, RunResult } from '../../hooks/core/host'

/**
 * A fake `Host` with inert defaults for every member, for bun specs that unit-test pure logic
 * against the `Host` contract. Pass `overrides` for the behaviour the spec actually cares about.
 */
export function fakeHost(overrides: Partial<Host> = {}): Host {
  const store = new Map<string, unknown>()
  return {
    run: async (): Promise<RunResult> => ({ exitCode: 0, stdout: '', stderr: '' }),
    readFile: async () => '',
    after: () => ({ cancel: () => {} }),
    redraw: () => {},
    openPane: async () => true,
    closePane: async () => {},
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
    messages: async () => [],
    debug: () => {},
    readGlobalConfig: async () => null,
    isCheckpointing: async () => true,
    ...overrides,
  }
}

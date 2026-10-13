import { describe, expect, test } from 'bun:test'
import { splitStoreKeyOf } from '../../hooks/names'
import {
  createSplitMode,
  forcedOf,
  SPLIT_MIN_COLUMNS,
  splitModeOf,
} from '../../hooks/views/diff/split-mode'
import { fakeHost } from './fake-host'

describe('splitModeOf', () => {
  test('auto: split at or above the threshold, unified below', () => {
    expect(splitModeOf(160, 160, null)).toBe(true)
    expect(splitModeOf(200, 160, null)).toBe(true)
    expect(splitModeOf(159, 160, null)).toBe(false)
  })

  test('forced unified wins at any width', () => {
    expect(splitModeOf(300, 160, 'unified')).toBe(false)
  })

  test('forced split wins below the threshold', () => {
    expect(splitModeOf(100, 160, 'split')).toBe(true)
  })

  test('nothing splits a pane too narrow to hold two sides, forced or not', () => {
    expect(splitModeOf(SPLIT_MIN_COLUMNS - 1, 10, 'split')).toBe(false)
    expect(splitModeOf(SPLIT_MIN_COLUMNS - 1, 10, null)).toBe(false)
    expect(splitModeOf(SPLIT_MIN_COLUMNS, 10, 'split')).toBe(true)
  })
})

describe('forcedOf', () => {
  test('only the two mode words are kept', () => {
    expect(forcedOf('split')).toBe('split')
    expect(forcedOf('unified')).toBe('unified')
    expect(forcedOf('both')).toBeNull()
    expect(forcedOf(undefined)).toBeNull()
    expect(forcedOf(3)).toBeNull()
  })
})

describe('createSplitMode', () => {
  const storeHost = (initial: Record<string, unknown> = {}) => {
    const store = new Map<string, unknown>(Object.entries(initial))
    const host = fakeHost({
      storeGet: async key => store.get(key),
      storeSet: async (key, value) => {
        store.set(key, value)
      },
    })
    return { host, store }
  }

  test('with nothing stored the width decides', async () => {
    const { host } = storeHost()
    const mode = createSplitMode(host, 160)
    await mode.resolveStored('/repo')
    expect(mode.isSplit(200)).toBe(true)
    expect(mode.isSplit(100)).toBe(false)
  })

  test('a stored forced mode is read once per repository', async () => {
    const { host } = storeHost({ [splitStoreKeyOf('/repo')]: 'unified' })
    const mode = createSplitMode(host, 160)
    await mode.resolveStored('/repo')
    expect(mode.isSplit(300)).toBe(false)
  })

  test('toggling flips the mode drawn now and persists the forced choice', async () => {
    const { host, store } = storeHost()
    const mode = createSplitMode(host, 160)
    await mode.resolveStored('/repo')

    mode.toggle(100) // unified now, so this forces split
    expect(mode.isSplit(100)).toBe(true)
    await Promise.resolve()
    expect(store.get(splitStoreKeyOf('/repo'))).toBe('split')

    mode.toggle(100) // split now, so this forces unified
    expect(mode.isSplit(100)).toBe(false)
    await Promise.resolve()
    expect(store.get(splitStoreKeyOf('/repo'))).toBe('unified')
  })

  test('a repository switch rereads; no repository keeps the choice in memory only', async () => {
    const { host, store } = storeHost({ [splitStoreKeyOf('/b')]: 'split' })
    const mode = createSplitMode(host, 160)
    await mode.resolveStored('/a')
    expect(mode.isSplit(100)).toBe(false)
    await mode.resolveStored('/b')
    expect(mode.isSplit(100)).toBe(true)

    await mode.resolveStored(null)
    mode.toggle(100)
    expect(mode.isSplit(100)).toBe(false)
    await Promise.resolve()
    expect(store.get(splitStoreKeyOf('/b'))).toBe('split')
  })

  test('a failing store read or write is logged, not thrown', async () => {
    const debugs: string[] = []
    const host = fakeHost({
      storeGet: async () => {
        throw new Error('boom')
      },
      storeSet: async () => {
        throw new Error('boom')
      },
      debug: message => void debugs.push(message),
    })
    const mode = createSplitMode(host, 160)
    await mode.resolveStored('/repo')
    mode.toggle(200)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(debugs.length).toBe(2)
  })
})

import { describe, expect, test } from 'bun:test'
import { splitStoreKeyOf } from '../../hooks/names'
import { type Chip, chipsLayout } from '../../hooks/ui/chips'
import { headerChipsOf } from '../../hooks/views/diff/header-plan'
import {
  createSplitMode,
  forcedOf,
  SPLIT_CHIP_PRIORITY,
  SPLIT_MIN_COLUMNS,
  splitChipOf,
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

  test('a toggle pressed while the stored read is in flight survives the late read', async () => {
    let release: (value: unknown) => void = () => {}
    const writes: unknown[] = []
    const host = fakeHost({
      storeGet: () => new Promise(resolve => (release = resolve)),
      storeSet: async (_key, value) => {
        writes.push(value)
      },
    })
    const mode = createSplitMode(host, 160)
    const reading = mode.resolveStored('/repo')
    mode.toggle(200)
    release('split')
    await reading
    expect(mode.isSplit(200)).toBe(false)
    expect(writes).toEqual(['unified'])
  })

  test('a late read for a previous repository is dropped and the mode resets on a switch', async () => {
    const releases = new Map<string, (value: unknown) => void>()
    const host = fakeHost({
      storeGet: key => new Promise(resolve => releases.set(key, resolve)),
    })
    const mode = createSplitMode(host, 160)
    const first = mode.resolveStored('/a')
    const second = mode.resolveStored('/b')
    releases.get(splitStoreKeyOf('/a'))?.('unified')
    await first
    expect(mode.isSplit(200)).toBe(true)
    releases.get(splitStoreKeyOf('/b'))?.('split')
    await second
    expect(mode.isSplit(100)).toBe(true)
  })

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
    expect(mode.isSplit(100)).toBe(false)
    mode.toggle(100)
    expect(mode.isSplit(100)).toBe(true)
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

describe('splitChipOf', () => {
  const noop = () => {}

  test('names the mode a press switches to', () => {
    expect(splitChipOf(false, noop)).toMatchObject({ key: 'split', icon: '◫', label: 'split' })
    expect(splitChipOf(true, noop)).toMatchObject({ key: 'split', icon: '≡', label: 'unified' })
  })

  test('presses through the handler it was given', () => {
    let pressed = 0
    splitChipOf(false, () => {
      pressed += 1
    }).onPress()
    expect(pressed).toBe(1)
  })

  test('sits between refresh and clear in priority', () => {
    expect(SPLIT_CHIP_PRIORITY).toBe(1.5)
  })

  const chips = (): Chip[] =>
    headerChipsOf({ pending: 2, confirmingClear: false, includeRefresh: true, isSplit: false })

  test('every chip keeps its words when the row has room', () => {
    expect(chipsLayout(chips(), 66)).toEqual(Array(7).fill('words'))
  })

  test('refresh gives way first, the split chip right after it, clear only after both', () => {
    const modesAt = (room: number) => chipsLayout(chips(), room)
    const keys = chips().map(chip => chip.key)
    const iconed = (room: number) => keys.filter((_, i) => modesAt(room)[i] === 'icons')
    expect(iconed(66)).toEqual([])
    // Find the first room that shrinks anything: it must be refresh alone.
    let room = 66
    while (room > 0 && iconed(room - 1).length === 0) room -= 1
    const firstShrunk = iconed(room - 1)
    expect(firstShrunk).toEqual(['previous', 'next', 'refresh'])
    while (room > 0 && !iconed(room - 1).includes('split')) room -= 1
    expect(room).toBeGreaterThan(0)
    expect(iconed(room - 1)).toEqual(['previous', 'next', 'refresh', 'split'])
    expect(iconed(room - 1)).not.toContain('clear')
  })
})

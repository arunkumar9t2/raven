import { describe, expect, test } from 'bun:test'
import { createPower } from '../../hooks/core/power'

describe('createPower', () => {
  test('starts on, remembering nothing', () => {
    const power = createPower()
    expect(power.isOff()).toBe(false)
    expect(power.snapshot()).toBeNull()
  })

  test('turning off remembers the closed panes and the front one', () => {
    const power = createPower()
    power.turnOff({ ids: ['raven', 'raven-doc'], front: 'raven-doc' })
    expect(power.isOff()).toBe(true)
    expect(power.snapshot()).toEqual({ ids: ['raven', 'raven-doc'], front: 'raven-doc' })
  })

  test('turning off with nothing open is still off', () => {
    const power = createPower()
    power.turnOff({ ids: [] })
    expect(power.isOff()).toBe(true)
  })

  test('a placed pane turns it back on and forgets the snapshot', () => {
    const power = createPower()
    power.turnOff({ ids: ['raven'], front: 'raven' })
    power.noteOpened()
    expect(power.isOff()).toBe(false)
    expect(power.snapshot()).toBeNull()
  })
})

import { describe, expect, test } from 'bun:test'
import { createRaven } from '../../hooks/core/raven'
import { DEFAULT_SETTINGS } from '../../hooks/core/settings'
import { fakeHost } from './fake-host'

describe('Raven.press', () => {
  test('a throwing handler is logged and does not reject', () => {
    const logs: string[] = []
    const raven = createRaven(
      fakeHost({ debug: message => logs.push(message) }),
      DEFAULT_SETTINGS,
      () => 0,
    )
    raven.registerPress('pane', 'boom', () => {
      throw new Error('nope')
    })
    expect(() => raven.press('pane', 'boom')).not.toThrow()
    expect(logs.join()).toContain('boom')
    expect(logs.join()).toContain('nope')
  })
})

import { describe, expect, test } from 'bun:test'
import type { RenderSurface } from 'claude-code'
import { capabilitiesOf } from '../../hooks/core/view'

describe('capabilitiesOf', () => {
  test('a surface missing from the table degrades to no capabilities, not a throw', () => {
    const unknown = 'watch' as RenderSurface
    expect(capabilitiesOf(unknown)).toEqual({
      canType: false,
      canPick: false,
      canShowImage: false,
    })
  })
})

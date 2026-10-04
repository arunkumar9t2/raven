import { describe, expect, test } from 'bun:test'
import type { RenderSurface } from 'claude-code'
import { capabilitiesOf } from '../../hooks/core/view'

describe('capabilitiesOf', () => {
  test('keyboardControls forces the plain-Button fallback on every surface (R42)', () => {
    for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as RenderSurface[]) {
      expect(capabilitiesOf(surface, true).canClient).toBe(false)
    }
    expect(capabilitiesOf('terminal', false).canClient).toBe(true)
    expect(capabilitiesOf('terminal', true).canType).toBe(true)
  })

  test('a surface missing from the table degrades to no capabilities, not a throw', () => {
    const unknown = 'watch' as RenderSurface
    expect(capabilitiesOf(unknown)).toEqual({
      canType: false,
      canPick: false,
      canShowImage: false,
      canClient: false,
    })
  })
})

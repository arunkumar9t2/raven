import { describe, expect, test } from 'bun:test'
import { createBandState } from '../../hooks/core/band-state'
import type { Kit } from '../../hooks/core/view'
import type { Review } from '../../hooks/review/review'
import { fakeHost } from './fake-host'

const review = (pending: number) =>
  ({ load: async () => {}, pending: () => new Array(pending).fill({}) }) as unknown as Review
const deps = { openDiff: async () => {}, openDoc: async () => {}, sendReview: async () => true }
const kit = { rows: 1, columns: 80 } as unknown as Kit

describe('createBandState band', () => {
  test('beforeRender runs only when the band draws, and after the awaits', async () => {
    const calls: string[] = []
    const host = fakeHost({
      shownPaneIds: async () => {
        calls.push('panes')
        return new Set()
      },
      run: async () => ({ exitCode: 128, stdout: '', stderr: '' }),
    })
    // Nothing pending: no draw, so no registration reset.
    await createBandState(host, review(0), deps).band(kit, false, () => calls.push('begin'))
    expect(calls).toEqual([])
    // A survey holds the band: same.
    await createBandState(host, review(2), deps).band(kit, true, () => calls.push('begin'))
    expect(calls).toEqual([])
  })
})

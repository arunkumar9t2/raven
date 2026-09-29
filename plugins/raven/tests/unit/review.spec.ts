import { describe, expect, test } from 'bun:test'
import type { Host } from '../../hooks/core/host'
import { createReview } from '../../hooks/review/review'

function fakeHost(onStatus?: (text: string | undefined) => void): Host {
  const store = new Map<string, unknown>()
  return {
    run: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
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
      store.set(key, JSON.parse(JSON.stringify(value)))
    },
    submitPrompt: async () => {},
    cwd: async () => '/repo',
    fork: async () => null,
    status: text => onStatus?.(text),
    fillPrompt: async () => ({ isFilled: true }),
    toast: () => {},
    messages: async () => [],
    debug: () => {},
    readGlobalConfig: async () => null,
    isCheckpointing: async () => true,
  }
}

describe('createReview state transitions', () => {
  test('add -> take marks sent -> markAddressed -> resend', async () => {
    const review = createReview(fakeHost(), () => 1)
    await review.load('/repo')

    review.add({ path: 'a.ts', text: 'fix this' })
    review.add({ path: 'b.ts', text: 'and this' })
    expect(review.pending()).toHaveLength(2)
    expect(review.comments()).toHaveLength(2)

    const taken = review.take()
    expect(taken).toHaveLength(2)
    expect(review.pending()).toHaveLength(0)
    expect(review.sent()).toHaveLength(2)
    expect(review.comments()).toHaveLength(2)

    const [first, second] = taken
    review.markAddressed([first?.id as string])
    expect(review.sent()).toHaveLength(0)
    expect(review.comments().find(c => c.id === first?.id)?.status).toBe('addressed')
    expect(review.comments().find(c => c.id === second?.id)?.status).toBe('open')

    review.resend()
    expect(review.pending().map(c => c.id)).toEqual([second?.id as string])
    expect(review.comments().find(c => c.id === first?.id)?.status).toBe('addressed')
  })

  test('restore undoes take for the named ids, leaving other sent comments alone', () => {
    const review = createReview(fakeHost(), () => 1)
    review.add({ path: 'a.ts', text: 'fix this' })
    review.add({ path: 'b.ts', text: 'and this' })
    const [first, second] = review.take()

    review.restore([first?.id as string])

    expect(review.pending().map(c => c.id)).toEqual([first?.id as string])
    expect(review.sent().map(c => c.id)).toEqual([second?.id as string])
  })

  test('take with nothing pending returns empty and leaves sent comments as sent', () => {
    const review = createReview(fakeHost(), () => 1)
    review.add({ path: 'a.ts', text: 'x' })
    review.take()
    expect(review.take()).toEqual([])
    expect(review.sent()).toHaveLength(1)
  })

  test('clear drops every comment regardless of status', () => {
    const review = createReview(fakeHost(), () => 1)
    review.add({ path: 'a.ts', text: 'x' })
    review.take()
    review.clear()
    expect(review.comments()).toHaveLength(0)
    expect(review.sent()).toHaveLength(0)
  })

  test('persists across load calls for the same repository via the store', async () => {
    const host = fakeHost()
    const reviewA = createReview(host, () => 1)
    await reviewA.load('/repo')
    reviewA.add({ path: 'a.ts', text: 'persisted' })

    const reviewB = createReview(host, () => 2)
    await reviewB.load('/repo')
    expect(reviewB.comments().map(c => c.text)).toEqual(['persisted'])
  })
})

describe('createReview pending status', () => {
  test('status is set on the first pending comment and cleared once it is taken', () => {
    const statuses: (string | undefined)[] = []
    const review = createReview(
      fakeHost(text => statuses.push(text)),
      () => 1,
    )

    review.add({ path: 'a.ts', text: 'x' })
    review.add({ path: 'b.ts', text: 'y' })
    review.take()

    expect(statuses).toEqual(['1 review comment pending', '2 review comments pending', undefined])
  })

  test('a mutation that leaves the pending count unchanged does not re-notify', () => {
    const statuses: (string | undefined)[] = []
    const review = createReview(
      fakeHost(text => statuses.push(text)),
      () => 1,
    )

    review.add({ path: 'a.ts', text: 'x' })
    review.remove('missing-id')

    expect(statuses).toEqual(['1 review comment pending'])
  })
})

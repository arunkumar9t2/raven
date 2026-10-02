import { describe, expect, test } from 'bun:test'
import { createReview } from '../../hooks/review/review'
import { fakeHost as fakeHostBase } from './fake-host'

/** `fakeHost`, but `storeSet` deep-clones so a later mutation of a loaded comment can't leak back. */
function fakeHost(onStatus?: (text: string | undefined) => void) {
  const store = new Map<string, unknown>()
  return fakeHostBase({
    storeGet: async key => store.get(key),
    storeSet: async (key, value) => {
      store.set(key, JSON.parse(JSON.stringify(value)))
    },
    status: text => onStatus?.(text),
  })
}

describe('createReview state transitions', () => {
  test('add -> take marks sent -> resolveBatch -> resend', async () => {
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
    const batchIds = taken.map(c => c.id)
    review.resolveBatch(batchIds, [first?.id as string])
    expect(review.sent()).toHaveLength(0)
    expect(review.comments().find(c => c.id === first?.id)?.status).toBe('addressed')
    expect(review.comments().find(c => c.id === second?.id)?.status).toBe('open')

    review.resend()
    expect(review.pending().map(c => c.id)).toEqual([second?.id as string])
    expect(review.comments().find(c => c.id === first?.id)?.status).toBe('addressed')
  })

  test('resolveBatch only touches ids in its own batch, leaving a later batch sent while it resolves', () => {
    const review = createReview(fakeHost(), () => 1)

    review.add({ path: 'a.ts', text: 'A' })
    const batchA = review.take().map(c => c.id)

    // A newer batch sent while batch A's resolve (e.g. a fork) is still in flight.
    review.add({ path: 'b.ts', text: 'B' })
    const batchB = review.take().map(c => c.id)

    review.resolveBatch(batchA, [])

    expect(review.comments().find(c => c.id === batchA[0])?.status).toBe('open')
    expect(review.sent().map(c => c.id)).toEqual(batchB)
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

  test('take with a filter takes the live comments and opens the rest', async () => {
    const review = createReview(fakeHost(), () => 1)
    review.add({ path: 'a.ts', text: 'live' })
    review.add({ path: 'gone.ts', text: 'stale' })
    const taken = review.take(comment => comment.path === 'a.ts')
    expect(taken.map(comment => comment.text)).toEqual(['live'])
    expect(review.comments().find(comment => comment.path === 'gone.ts')?.status).toBe('open')
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

  test('a comment added before the store load lands survives the load', async () => {
    const review = createReview(fakeHostBase({ storeGet: async () => [] }), () => 1)
    review.add({ path: '/plans/p.md', section: 'Goals', text: 'early' })
    await review.load('/repo')
    expect(review.comments().map(comment => comment.text)).toEqual(['early'])
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

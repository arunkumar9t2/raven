import { countOf } from '../core/format'
import type { Host } from '../core/host'
import { commentsStoreKeyOf } from '../names'
import { addComment, type Comment, type Comments, commentsFrom, removeComment } from './comments'

type AddInput = Omit<Comment, 'id' | 'createdAt' | 'status'> & { status?: Comment['status'] }

/**
 * The session's review comments on the diff, persisted per repository so a restarted session keeps
 * them across the pending/sent/addressed cycle.
 */
export type Review = {
  readonly comments: () => Comments
  load: (repository: string) => Promise<void>
  add: (input: AddInput) => void
  remove: (id: string) => void
  /** Hands the pending comments over and marks them sent: they ride exactly one prompt. */
  take: () => Comments
  /** Undoes `take()` for the named sent comments, moving them back to 'pending'. */
  restore: (ids: readonly string[]) => void
  /** Comments not yet sent to the model. */
  pending: () => Comments
  /** Comments sent to the model, awaiting a reply naming which were addressed. */
  sent: () => Comments
  /** Moves the named sent comments to 'addressed'; every other sent comment becomes 'open'. */
  markAddressed: (ids: readonly string[]) => void
  /** Returns every 'open' comment to 'pending' so it rides the next prompt. */
  resend: () => void
  /** Drops every comment. */
  clear: () => void
}

/** The status line's text; the engine already prefixes it with the plugin's name. */
export const pendingTextOf = (count: number) => `${countOf(count, 'review comment')} pending`

export function createReview(host: Host, now: () => number): Review {
  let comments: Comments = []
  let scope: string | null = null
  // -1 so the first save/load, even at zero pending, does not skip clearing a stale status line.
  let lastPendingCount = -1

  /** Moves every comment with status `from` to `to`; `ids` given narrows it to those ids. */
  const moveStatus = (from: Comment['status'], to: Comment['status'], ids?: readonly string[]) => {
    const idSet = ids ? new Set(ids) : null
    comments = comments.map(comment =>
      comment.status === from && (!idSet || idSet.has(comment.id))
        ? { ...comment, status: to }
        : comment,
    )
  }

  const byStatus = (status: Comment['status']) =>
    comments.filter(comment => comment.status === status)

  const notifyStatus = () => {
    const count = byStatus('pending').length
    if (count === lastPendingCount) return
    lastPendingCount = count
    host.status(count > 0 ? pendingTextOf(count) : undefined)
  }

  const save = () => {
    if (scope !== null) void host.storeSet(commentsStoreKeyOf(scope), comments).catch(() => {})
    notifyStatus()
    host.redraw()
  }

  return {
    comments: () => comments,
    load: async repository => {
      if (scope === repository) return
      scope = repository
      comments = commentsFrom(await host.storeGet(commentsStoreKeyOf(repository)))
      notifyStatus()
      host.redraw()
    },
    add: input => {
      comments = addComment(comments, { ...input, createdAt: now() })
      save()
    },
    remove: id => {
      comments = removeComment(comments, id)
      save()
    },
    take: () => {
      const taken = byStatus('pending')
      if (taken.length > 0) {
        moveStatus('pending', 'sent')
        save()
      }
      return taken
    },
    restore: ids => {
      moveStatus('sent', 'pending', ids)
      save()
    },
    pending: () => byStatus('pending'),
    sent: () => byStatus('sent'),
    markAddressed: ids => {
      moveStatus('sent', 'addressed', ids)
      moveStatus('sent', 'open')
      save()
    },
    resend: () => {
      moveStatus('open', 'pending')
      save()
    },
    clear: () => {
      comments = []
      save()
    },
  }
}

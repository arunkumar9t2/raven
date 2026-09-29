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

export function createReview(host: Host, now: () => number): Review {
  let comments: Comments = []
  let scope: string | null = null

  const save = () => {
    if (scope !== null) void host.storeSet(commentsStoreKeyOf(scope), comments).catch(() => {})
    host.redraw()
  }

  return {
    comments: () => comments,
    load: async repository => {
      if (scope === repository) return
      scope = repository
      comments = commentsFrom(await host.storeGet(commentsStoreKeyOf(repository)))
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
      const taken = comments.filter(comment => comment.status === 'pending')
      if (taken.length > 0) {
        comments = comments.map(comment =>
          comment.status === 'pending' ? { ...comment, status: 'sent' } : comment,
        )
        save()
      }
      return taken
    },
    pending: () => comments.filter(comment => comment.status === 'pending'),
    sent: () => comments.filter(comment => comment.status === 'sent'),
    markAddressed: ids => {
      const addressed = new Set(ids)
      comments = comments.map(comment => {
        if (comment.status !== 'sent') return comment
        return { ...comment, status: addressed.has(comment.id) ? 'addressed' : 'open' }
      })
      save()
    },
    resend: () => {
      comments = comments.map(comment =>
        comment.status === 'open' ? { ...comment, status: 'pending' } : comment,
      )
      save()
    },
    clear: () => {
      comments = []
      save()
    },
  }
}

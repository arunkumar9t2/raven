import type { Host } from '../core/host'
import { commentsStoreKeyOf } from '../names'
import { addComment, type Comment, type Comments, commentsFrom, removeComment } from './comments'

/**
 * The session's pending review comments on the diff, persisted per repository so a restarted
 * session keeps them until they are sent.
 */
export type Review = {
  readonly comments: () => Comments
  load: (repository: string) => Promise<void>
  add: (input: Omit<Comment, 'id' | 'createdAt'>) => void
  remove: (id: string) => void
  /** Hands every pending comment over and clears them: they ride exactly one prompt. */
  take: () => Comments
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
      const taken = comments
      comments = []
      if (taken.length > 0) save()
      return taken
    },
  }
}

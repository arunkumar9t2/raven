export type Comment = { id: string; path: string; hunk?: string; text: string; createdAt: number }
// `hunk` is the '@@ -a,b +c,d @@' header of the hunk it anchors to; absent = whole-file comment.
export type Comments = readonly Comment[]

/** Adds a comment, assigning it a unique id derived from its timestamp. */
export function addComment(comments: Comments, input: Omit<Comment, 'id'>): Comments {
  const id = `${input.createdAt.toString(36)}-${comments.length}`
  return [...comments, { ...input, id }]
}

/** Removes a comment by id; a missing id leaves the list unchanged. */
export function removeComment(comments: Comments, id: string): Comments {
  return comments.filter(comment => comment.id !== id)
}

/** Comments anchored to a path and hunk; `hunk` undefined selects file-level ones only. */
export function commentsOn(comments: Comments, path: string, hunk?: string): Comments {
  return comments.filter(comment => comment.path === path && comment.hunk === hunk)
}

const PREAMBLE = "These are the user's review comments on the working-tree diff. Address them."

/**
 * The review as the model reads it: a short preamble saying these are the user's review comments
 * on the working-tree diff, to address them; then grouped by file, each hunk's comments under its
 * header. Returns undefined for no comments. Deterministic ordering: by path, file-level first,
 * then by hunk in first-seen order, then createdAt.
 */
export function reviewTextOf(comments: Comments): string | undefined {
  if (comments.length === 0) return undefined

  const paths = [...new Set(comments.map(comment => comment.path))].sort()
  const sections = paths.map(path => {
    const forPath = comments.filter(comment => comment.path === path)

    const seenHunks: string[] = []
    for (const comment of forPath) {
      if (comment.hunk !== undefined && !seenHunks.includes(comment.hunk)) {
        seenHunks.push(comment.hunk)
      }
    }
    // `Array#sort` always shunts `undefined` elements to the end regardless of comparator, so
    // file-level (hunk `undefined`) is kept out of the sorted array and prepended by hand.
    const hasFileLevel = forPath.some(comment => comment.hunk === undefined)
    const hunkOrder: (string | undefined)[] = hasFileLevel ? [undefined, ...seenHunks] : seenHunks

    const groups = hunkOrder.map(hunk => {
      const lines = forPath
        .filter(comment => comment.hunk === hunk)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(comment => `- ${comment.text}`)
        .join('\n')
      return hunk === undefined ? lines : `${hunk}\n${lines}`
    })

    return `${path}\n${groups.join('\n')}`
  })

  return `${PREAMBLE}\n\n${sections.join('\n\n')}`
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

function commentOf(value: unknown): Comment | null {
  if (!isRecord(value)) return null
  const { id, path, hunk, text, createdAt } = value
  if (typeof id !== 'string' || typeof path !== 'string' || typeof text !== 'string') return null
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null
  if (hunk !== undefined && typeof hunk !== 'string') return null
  return hunk === undefined ? { id, path, text, createdAt } : { id, path, hunk, text, createdAt }
}

/** Parses a stored value back into Comments, dropping malformed entries (store values are untrusted JSON). */
export function commentsFrom(value: unknown): Comments {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    const comment = commentOf(entry)
    return comment ? [comment] : []
  })
}

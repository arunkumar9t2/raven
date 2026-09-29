import { isRecord } from '../core/is-record'
import { bodyLinesOf, parseHeader } from '../git/hunks'

/** A single diff line a comment anchors to, inside its `hunk`. */
export type CommentLine = { number: number; side: 'old' | 'new'; text: string }

/** Where a comment sits in the send/reply cycle: pending → sent → addressed, or open to resend. */
export type CommentStatus = 'pending' | 'sent' | 'addressed' | 'open'

export type Comment = {
  id: string
  path: string
  /** The '@@ -a,b +c,d @@' header of the hunk this anchors to; absent = whole-file comment. */
  hunk?: string
  line?: CommentLine
  text: string
  status: CommentStatus
  createdAt: number
}
export type Comments = readonly Comment[]

type AddCommentInput = Omit<Comment, 'id' | 'status'> & { status?: CommentStatus }

/** Adds a comment, assigning it a unique id derived from its timestamp; status defaults to 'pending'. */
export function addComment(comments: Comments, input: AddCommentInput): Comments {
  const id = `${input.createdAt.toString(36)}-${comments.length}`
  return [...comments, { ...input, id, status: input.status ?? 'pending' }]
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

function commentLinesOf(comment: Comment): string {
  const suffix = `[${comment.id}]`
  if (!comment.line) return `- ${comment.text} ${suffix}`
  const sign = comment.line.side === 'old' ? '-' : '+'
  return `L${comment.line.number} ${sign} ${comment.line.text}\n  - ${comment.text} ${suffix}`
}

/**
 * Renders the given comments as the model reads them: a short preamble saying these are the
 * user's review comments on the working-tree diff, to address them; then grouped by file, each
 * hunk's comments under its header, a line-anchored comment quoting its diff line first. Callers
 * pass whichever subset should be sent (typically the pending ones). Returns undefined for none.
 * Deterministic ordering: by path, file-level first, then by hunk in first-seen order, then
 * createdAt. Each comment ends with its id in brackets so a later reply can name which it addressed.
 */
export function reviewTextOf(comments: Comments): string | undefined {
  if (comments.length === 0) return undefined

  const paths = [...new Set(comments.map(comment => comment.path))].sort()
  const sections = paths.map(path => {
    const forPath = comments.filter(comment => comment.path === path)

    const seenHunks = [
      ...new Set(forPath.flatMap(comment => (comment.hunk === undefined ? [] : [comment.hunk]))),
    ]
    // Keeps file-level (hunk `undefined`) first; it can't be sorted in among the hunk headers.
    const hasFileLevel = forPath.some(comment => comment.hunk === undefined)
    const hunkOrder: (string | undefined)[] = hasFileLevel ? [undefined, ...seenHunks] : seenHunks

    const groups = hunkOrder.map(hunk => {
      const lines = forPath
        .filter(comment => comment.hunk === hunk)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(commentLinesOf)
        .join('\n')
      return hunk === undefined ? lines : `${hunk}\n${lines}`
    })

    return `${path}\n${groups.join('\n')}`
  })

  return `${PREAMBLE}\n\n${sections.join('\n\n')}`
}

/** The changed lines of a hunk, each with the real line number it has on its side of the diff. */
export function changedLinesOf(hunk: { header: string; text: string }): CommentLine[] {
  const parsed = parseHeader(hunk.header)
  if (!parsed) return []
  let oldLine = parsed.oldStart
  let newLine = parsed.newStart

  const result: CommentLine[] = []
  // A line starting with '\' is the '\ No newline at end of file' marker for the line above it
  // and advances neither counter.
  for (const line of bodyLinesOf(hunk)) {
    if (line === '' || line.startsWith('\\')) continue
    if (line.startsWith('+')) {
      result.push({ number: newLine, side: 'new', text: line.slice(1) })
      newLine += 1
    } else if (line.startsWith('-')) {
      result.push({ number: oldLine, side: 'old', text: line.slice(1) })
      oldLine += 1
    } else {
      oldLine += 1
      newLine += 1
    }
  }
  return result
}

/** One file's comments split against its current hunks: file-level, live per-hunk, and outdated. */
export function groupByAnchor(
  comments: Comments,
  currentHunkHeaders: readonly string[],
): { file: Comment[]; byHunk: Map<string, Comment[]>; outdated: Comment[] } {
  const current = new Set(currentHunkHeaders)
  const file: Comment[] = []
  const byHunk = new Map<string, Comment[]>()
  const outdated: Comment[] = []

  for (const comment of comments) {
    if (comment.hunk === undefined) {
      file.push(comment)
    } else if (current.has(comment.hunk)) {
      const forHunk = byHunk.get(comment.hunk)
      if (forHunk) forHunk.push(comment)
      else byHunk.set(comment.hunk, [comment])
    } else {
      outdated.push(comment)
    }
  }

  return { file, byHunk, outdated }
}

function jsonArrayOf(candidate: string): unknown[] | null {
  try {
    const parsed = JSON.parse(candidate)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Parses a reply expected to carry a JSON array, tolerating a fence or prose around it. */
function arrayIn(reply: string): unknown[] {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced?.[1]) {
    const parsed = jsonArrayOf(fenced[1].trim())
    if (parsed) return parsed
  }
  for (const candidate of reply.match(/\[[^[\]]*\]/g) ?? []) {
    const parsed = jsonArrayOf(candidate)
    if (parsed) return parsed
  }
  return []
}

/** Parses a model reply expected to name addressed comment ids, keeping only ids actually sent. */
export function addressedIdsOf(reply: string, sentIds: readonly string[]): string[] {
  const known = new Set(sentIds)
  const ids = arrayIn(reply).filter((id): id is string => typeof id === 'string' && known.has(id))
  return [...new Set(ids)]
}

const STATUSES: readonly CommentStatus[] = ['pending', 'sent', 'addressed', 'open']

function statusOf(value: unknown): CommentStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
    ? (value as CommentStatus)
    : 'pending'
}

function lineOf(value: unknown): CommentLine | null {
  if (!isRecord(value)) return null
  const { number, side, text } = value
  if (typeof number !== 'number' || !Number.isFinite(number)) return null
  if (side !== 'old' && side !== 'new') return null
  if (typeof text !== 'string') return null
  return { number, side, text }
}

function commentOf(value: unknown): Comment | null {
  if (!isRecord(value)) return null
  const { id, path, hunk, line, text, createdAt } = value
  if (typeof id !== 'string' || typeof path !== 'string' || typeof text !== 'string') return null
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null
  if (hunk !== undefined && typeof hunk !== 'string') return null
  const parsedLine = line === undefined ? undefined : lineOf(line)
  if (line !== undefined && parsedLine === null) return null

  const comment: Comment = { id, path, text, createdAt, status: statusOf(value.status) }
  if (hunk !== undefined) comment.hunk = hunk
  if (parsedLine) comment.line = parsedLine
  return comment
}

/** Parses a stored value back into Comments, dropping malformed entries; a missing status reads as 'pending'. */
export function commentsFrom(value: unknown): Comments {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    const comment = commentOf(entry)
    return comment ? [comment] : []
  })
}

import { isRecord } from '../core/is-record'
import { bodyLinesOf, lineKindOf, parseHeader } from '../git/hunks'

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
  /** The doc section a doc comment is on: its heading, or '(top)' before the first one. */
  section?: string
  /** That section's 0-based position in the doc when the comment was made. */
  sectionIndex?: number
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

/**
 * Splits one anchor's comments into their addressed ones and the rest, each keeping its order —
 * the one implementation every anchor that collapses addressed comments into a single "✓ N
 * addressed" row (a diff anchor's `notesBlocksOf`, a doc section's own notes) builds on.
 */
export function splitAddressed(comments: Comments): { addressed: Comments; visible: Comments } {
  return {
    addressed: comments.filter(comment => comment.status === 'addressed'),
    visible: comments.filter(comment => comment.status !== 'addressed'),
  }
}

const PREAMBLE = "These are the user's review comments on files and docs. Address them."

/** "2nd", "3rd", "4th", … — the English ordinal suffix for `n` (`n` is always ≥ 2 here). */
function ordinalOf(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}

function commentLinesOf(comment: Comment): string {
  const suffix = `[${comment.id}]`
  if (!comment.line) return `- ${comment.text} ${suffix}`
  const sign = comment.line.side === 'old' ? '-' : '+'
  return `L${comment.line.number} ${sign} ${comment.line.text}\n  - ${comment.text} ${suffix}`
}

/**
 * Renders the given comments as the model reads them: a short preamble saying these are the
 * user's review comments on files and docs, to address them; then grouped by file, each hunk's
 * comments under its header, a line-anchored comment quoting its diff line first; a doc's
 * comments group instead under `§ <section heading>`, in first-seen (by createdAt) order. Callers
 * pass whichever subset should be sent (typically the pending ones). Returns undefined for none.
 * Deterministic ordering: by path, file-level first, then by hunk in first-seen order, then
 * createdAt. Each comment ends with its id in brackets so a later reply can name which it addressed.
 */
export function reviewTextOf(comments: Comments): string | undefined {
  if (comments.length === 0) return undefined

  const paths = [...new Set(comments.map(comment => comment.path))].sort()
  const sections = paths.map(path => {
    const forPath = comments.filter(comment => comment.path === path)

    if (forPath.every(comment => comment.section !== undefined)) {
      const sorted = [...forPath].sort((a, b) => a.createdAt - b.createdAt)
      // Two sections can share a heading (duplicate headings in the doc); `sectionIndex`, when
      // present, keys them apart so their comments never merge into one group for Claude — the
      // heading text alone stays what Claude reads, a repeat just gets an ordinal suffix. A
      // legacy comment with no `sectionIndex` (made before that field existed) matches the first
      // section with its heading on screen (`doc-view.tsx`'s `sectionsBody`), so it groups the
      // same way here: as the first occurrence's index, when one exists for that heading.
      const firstIndexByHeading = new Map<string, number>()
      for (const comment of forPath) {
        if (comment.sectionIndex === undefined) continue
        const heading = comment.section as string
        const current = firstIndexByHeading.get(heading)
        if (current === undefined || comment.sectionIndex < current) {
          firstIndexByHeading.set(heading, comment.sectionIndex)
        }
      }
      const keyOf = (comment: Comment) => {
        const heading = comment.section as string
        const index = comment.sectionIndex ?? firstIndexByHeading.get(heading)
        return index !== undefined ? `${heading}\u0000${index}` : heading
      }
      // A group's order of appearance (first commented on) is independent of its ordinal label:
      // the label ranks groups by their `sectionIndex` ascending — the section's actual position
      // in the doc — so Claude reads "(2nd)" as "further down the doc", never "commented on
      // second".
      const indicesByHeading = new Map<string, number[]>()
      for (const comment of sorted) {
        if (comment.sectionIndex === undefined) continue
        const heading = comment.section as string
        const indices = indicesByHeading.get(heading) ?? []
        if (!indices.includes(comment.sectionIndex)) indices.push(comment.sectionIndex)
        indicesByHeading.set(heading, indices)
      }
      const rankOf = new Map<string, number>()
      for (const [heading, indices] of indicesByHeading) {
        const ascending = [...indices].sort((a, b) => a - b)
        ascending.forEach((index, i) => {
          rankOf.set(`${heading}\u0000${index}`, i + 1)
        })
      }

      const order = [...new Set(sorted.map(keyOf))]
      const groups = order.map(key => {
        const sample = sorted.find(comment => keyOf(comment) === key) as Comment
        const heading = sample.section as string
        const rank = sample.sectionIndex !== undefined ? (rankOf.get(key) ?? 1) : 1
        const label = rank === 1 ? heading : `${heading} (${ordinalOf(rank)})`
        const lines = sorted
          .filter(comment => keyOf(comment) === key)
          .map(commentLinesOf)
          .join('\n')
        return `§ ${label}\n${lines}`
      })
      return `${path}\n${groups.join('\n')}`
    }

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
  for (const line of bodyLinesOf(hunk)) {
    const kind = lineKindOf(line)
    // A line starting with '\' is the '\ No newline at end of file' marker for the line above it
    // and advances neither counter.
    if (kind === null) continue
    if (kind === 'add') {
      result.push({ number: newLine, side: 'new', text: line.slice(1) })
      newLine += 1
    } else if (kind === 'del') {
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
  const { id, path, hunk, line, section, sectionIndex, text, createdAt } = value
  if (typeof id !== 'string' || typeof path !== 'string' || typeof text !== 'string') return null
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt)) return null
  if (hunk !== undefined && typeof hunk !== 'string') return null
  const parsedLine = line === undefined ? undefined : lineOf(line)
  if (line !== undefined && parsedLine === null) return null
  if (section !== undefined && typeof section !== 'string') return null
  if (
    sectionIndex !== undefined &&
    (typeof sectionIndex !== 'number' || !Number.isInteger(sectionIndex) || sectionIndex < 0)
  )
    return null

  const comment: Comment = { id, path, text, createdAt, status: statusOf(value.status) }
  if (hunk !== undefined) comment.hunk = hunk
  if (parsedLine) comment.line = parsedLine
  if (section !== undefined) comment.section = section
  if (sectionIndex !== undefined) comment.sectionIndex = sectionIndex
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

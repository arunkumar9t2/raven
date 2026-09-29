import type { Comment, Comments } from './comments'

const PREAMBLE = 'The turn that just finished may have addressed some of the review comments below.'
const ASK =
  'Reply with ONLY a JSON array of the ids it addressed, e.g. ["id1","id2"]. If none, reply [].'

function lineOf(comment: Comment): string {
  return `[${comment.id}] ${comment.path}${comment.line ? ` L${comment.line.number}` : ''}: ${comment.text}`
}

/** The prompt a fork asks to learn which sent comments the last turn addressed. */
export function resolvePromptOf(sent: Comments): string {
  return [PREAMBLE, ...sent.map(lineOf), '', ASK].join('\n')
}

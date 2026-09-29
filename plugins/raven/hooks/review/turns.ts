import type { SessionMessage } from 'claude-code'
import { isRecord } from '../core/is-record'
import type { ChangedFile } from '../git/changes'
import { bodyLinesOf, clampHunk, type Hunk, hunkFrom, lineKindOf } from '../git/hunks'

/** One edited file: its path and the hunks left by the turn's tool uses, in call order. */
export type TurnFile = { path: string; hunks: Hunk[] }

export type TurnEdits = { index: number; prompt: string; files: TurnFile[] }

const PROMPT_CHARS = 60
const EDIT_TOOLS = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit']

const isPromptRow = (message: SessionMessage) =>
  message.role === 'user' &&
  (message.toolResults === undefined || message.toolResults.length === 0) &&
  message.text !== ''

function promptOf(text: string): string {
  const firstLine = text.split('\n')[0] ?? ''
  const chars = [...firstLine]
  return chars.length <= PROMPT_CHARS ? firstLine : `${chars.slice(0, PROMPT_CHARS - 1).join('')}…`
}

function addedHunkOf(content: string): Hunk {
  // A trailing '\n' would otherwise split into a spurious empty final line.
  const lines = content.endsWith('\n') ? content.slice(0, -1).split('\n') : content.split('\n')
  const header = `@@ -0,0 +1,${lines.length} @@`
  return clampHunk(
    hunkFrom(
      header,
      lines.map(line => `+${line}`),
    ),
  )
}

function editOf(use: SessionMessage['toolUses'][number]): TurnFile | null {
  if (use.isError || !EDIT_TOOLS.includes(use.tool)) return null
  const input = use.input

  if (use.tool === 'Edit') {
    const { file_path, old_string, new_string } = input
    if (typeof file_path !== 'string' || typeof old_string !== 'string') return null
    if (typeof new_string !== 'string') return null
    return { path: file_path, hunks: [hunkOfChange(old_string, new_string)] }
  }

  if (use.tool === 'MultiEdit') {
    const { file_path, edits } = input
    if (typeof file_path !== 'string' || !Array.isArray(edits)) return null
    const hunks = edits.flatMap(edit => {
      if (!isRecord(edit)) return []
      const { old_string, new_string } = edit
      return typeof old_string === 'string' && typeof new_string === 'string'
        ? [hunkOfChange(old_string, new_string)]
        : []
    })
    return hunks.length > 0 ? { path: file_path, hunks } : null
  }

  if (use.tool === 'Write') {
    const { file_path, content } = input
    return typeof file_path === 'string' && typeof content === 'string'
      ? { path: file_path, hunks: [addedHunkOf(content)] }
      : null
  }

  const { notebook_path, new_source } = input
  return typeof notebook_path === 'string' && typeof new_source === 'string'
    ? { path: notebook_path, hunks: [addedHunkOf(new_source)] }
    : null
}

function turnEditsOfRows(rows: readonly SessionMessage[], index: number): TurnEdits {
  const edits = rows
    .flatMap(row => (row.role === 'assistant' ? row.toolUses : []))
    .flatMap(use => {
      const edit = editOf(use)
      return edit ? [edit] : []
    })

  const byPath = new Map<string, TurnFile>()
  for (const edit of edits) {
    const earlier = byPath.get(edit.path)
    byPath.set(
      edit.path,
      earlier ? { path: edit.path, hunks: [...earlier.hunks, ...edit.hunks] } : edit,
    )
  }

  return { index, prompt: promptOf(rows[0]?.text ?? ''), files: [...byPath.values()] }
}

/** Each user turn whose tool uses edited files (Edit, MultiEdit, Write, NotebookEdit), oldest first. */
export function turnEditsOf(messages: readonly SessionMessage[]): TurnEdits[] {
  const starts = messages.flatMap((message, at) => (isPromptRow(message) ? [at] : []))

  return starts
    .map((start, ordinal) =>
      turnEditsOfRows(messages.slice(start, starts[ordinal + 1]), ordinal + 1),
    )
    .filter(turn => turn.files.length > 0)
}

/** Turn `index`'s files, or `[]` when no turn carries that index (e.g. a rewind dropped it). */
export function turnFilesOf(turns: readonly TurnEdits[], index: number): TurnFile[] {
  return turns.find(turn => turn.index === index)?.files ?? []
}

/** A turn's file as a `ChangedFile` for the diff view's file list: counts from its hunks' lines. */
export function changedFileOfTurnFile(file: TurnFile): ChangedFile {
  let adds = 0
  let dels = 0
  for (const hunk of file.hunks) {
    for (const line of bodyLinesOf(hunk)) {
      const kind = lineKindOf(line)
      if (kind === 'add') adds++
      else if (kind === 'del') dels++
    }
  }
  return { path: file.path, status: 'modified', adds, dels, isBinary: false }
}

/** A unified-diff hunk turning `before` into `after`, header line numbers relative to the snippet. */
export function hunkOfChange(before: string, after: string): Hunk {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')

  let prefix = 0
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix++
  }

  let suffix = 0
  const maxSuffix = Math.min(beforeLines.length, afterLines.length) - prefix
  while (
    suffix < maxSuffix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix++
  }

  const prefixLines = beforeLines.slice(0, prefix)
  const suffixLines = beforeLines.slice(beforeLines.length - suffix)
  const removed = beforeLines.slice(prefix, beforeLines.length - suffix)
  const added = afterLines.slice(prefix, afterLines.length - suffix)

  const header = `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`
  const body = [
    ...prefixLines.map(line => ` ${line}`),
    ...removed.map(line => `-${line}`),
    ...added.map(line => `+${line}`),
    ...suffixLines.map(line => ` ${line}`),
  ]

  return clampHunk(hunkFrom(header, body))
}

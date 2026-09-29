import { describe, expect, test } from 'bun:test'
import type { SessionMessage } from 'claude-code'
import {
  changedFileOfTurnFile,
  hunkOfChange,
  turnEditsOf,
  turnFilesOf,
} from '../../hooks/review/turns'

type ToolUse = SessionMessage['toolUses'][number]

const promptRow = (text: string): SessionMessage => ({ role: 'user', text, toolUses: [] })

const toolResultRow = (): SessionMessage => ({
  role: 'user',
  text: '',
  toolUses: [],
  toolResults: [{ tool_use_id: 't', text: 'ok', isError: false }],
})

const assistantRow = (toolUses: ToolUse[]): SessionMessage => ({
  role: 'assistant',
  text: '',
  toolUses,
})

const useOf = (tool: string, input: Record<string, unknown>, isError?: true): ToolUse => ({
  tool_use_id: `${tool}-${Math.random()}`,
  tool,
  input,
  ...(isError ? { isError } : {}),
})

describe('turnEditsOf', () => {
  test('excludes a turn whose tool uses edited nothing', () => {
    const turns = turnEditsOf([
      promptRow('add a helper'),
      assistantRow([useOf('Edit', { file_path: '/r/a.ts', old_string: 'a', new_string: 'b' })]),
      toolResultRow(),
      promptRow('just answer a question'),
      assistantRow([useOf('Read', { file_path: '/r/a.ts' })]),
      toolResultRow(),
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0]?.index).toBe(1)
    expect(turns[0]?.prompt).toBe('add a helper')
    expect(turns[0]?.files.map(file => file.path)).toEqual(['/r/a.ts'])
  })

  test('an Edit and a Write in one turn become two files, in call order', () => {
    const turns = turnEditsOf([
      promptRow('edit one file and create another'),
      assistantRow([
        useOf('Edit', { file_path: '/r/a.ts', old_string: 'a', new_string: 'b' }),
        useOf('Write', { file_path: '/r/new.ts', content: 'x\ny\n' }),
      ]),
      toolResultRow(),
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0]?.files.map(file => file.path)).toEqual(['/r/a.ts', '/r/new.ts'])
    expect(turns[0]?.files[1]?.hunks[0]?.text).toBe('@@ -0,0 +1,2 @@\n+x\n+y\n')
  })

  test('two Edit calls to the same file in one turn keep both hunks, in order', () => {
    const turns = turnEditsOf([
      promptRow('edit the same file twice'),
      assistantRow([
        useOf('Edit', { file_path: '/r/a.ts', old_string: 'one', new_string: 'ONE' }),
        useOf('Edit', { file_path: '/r/a.ts', old_string: 'two', new_string: 'TWO' }),
      ]),
      toolResultRow(),
    ])

    expect(turns[0]?.files).toHaveLength(1)
    expect(turns[0]?.files[0]?.hunks).toHaveLength(2)
    expect(turns[0]?.files[0]?.hunks[0]?.text).toContain('+ONE')
    expect(turns[0]?.files[0]?.hunks[1]?.text).toContain('+TWO')
  })

  test('skips a failed tool use', () => {
    const turns = turnEditsOf([
      promptRow('try an edit that fails'),
      assistantRow([
        useOf('Edit', { file_path: '/r/a.ts', old_string: 'a', new_string: 'b' }, true),
      ]),
      toolResultRow(),
    ])

    expect(turns).toHaveLength(0)
  })

  test('a MultiEdit groups every sub-edit into one file, in order', () => {
    const turns = turnEditsOf([
      promptRow('multi-edit a file'),
      assistantRow([
        useOf('MultiEdit', {
          file_path: '/r/a.ts',
          edits: [
            { old_string: 'one', new_string: 'ONE' },
            { old_string: 'two', new_string: 'TWO' },
          ],
        }),
      ]),
      toolResultRow(),
    ])

    expect(turns).toHaveLength(1)
    expect(turns[0]?.files).toHaveLength(1)
    expect(turns[0]?.files[0]?.hunks).toHaveLength(2)
    expect(turns[0]?.files[0]?.hunks[0]?.text).toContain('-one')
    expect(turns[0]?.files[0]?.hunks[0]?.text).toContain('+ONE')
    expect(turns[0]?.files[0]?.hunks[1]?.text).toContain('-two')
    expect(turns[0]?.files[0]?.hunks[1]?.text).toContain('+TWO')
  })

  test('numbers a turn by its place among all prompts, not just edited ones', () => {
    const turns = turnEditsOf([
      promptRow('first, no edits'),
      assistantRow([useOf('Read', { file_path: '/r/a.ts' })]),
      toolResultRow(),
      promptRow('second, edits'),
      assistantRow([useOf('Edit', { file_path: '/r/a.ts', old_string: 'a', new_string: 'b' })]),
      toolResultRow(),
    ])

    expect(turns.map(turn => turn.index)).toEqual([2])
  })
})

describe('hunkOfChange', () => {
  test('keeps common prefix/suffix lines as context around the changed middle', () => {
    const before = ['line1', 'line2', 'line3', 'line4'].join('\n')
    const after = ['line1', 'CHANGED', 'line4'].join('\n')

    const hunk = hunkOfChange(before, after)

    expect(hunk.header).toBe('@@ -1,4 +1,3 @@')
    expect(hunk.text).toBe('@@ -1,4 +1,3 @@\n line1\n-line2\n-line3\n+CHANGED\n line4\n')
  })

  test('a change with no shared lines is all removed then all added', () => {
    const hunk = hunkOfChange('a', 'b')
    expect(hunk.text).toBe('@@ -1,1 +1,1 @@\n-a\n+b\n')
  })
})

describe('truncation', () => {
  test('a long turn edit is cut under the 10000-char cap with a marker line', () => {
    const longAfter = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join('\n')

    const turns = turnEditsOf([
      promptRow('write a huge file'),
      assistantRow([useOf('Write', { file_path: '/r/big.ts', content: longAfter })]),
      toolResultRow(),
    ])

    const hunk = turns[0]?.files[0]?.hunks[0]
    expect(hunk?.text.length).toBeLessThanOrEqual(10_000)
    expect(hunk?.text).toContain('more lines)')
  })

  test('hunkOfChange itself truncates a long diff under the cap', () => {
    const before = Array.from({ length: 2000 }, (_, i) => `old ${i}`).join('\n')
    const after = Array.from({ length: 2000 }, (_, i) => `new ${i}`).join('\n')

    const hunk = hunkOfChange(before, after)

    expect(hunk.text.length).toBeLessThanOrEqual(10_000)
    expect(hunk.text).toContain('more lines)')
  })
})

describe('turnFilesOf', () => {
  test('returns the files of the turn with a matching index', () => {
    const turns = turnEditsOf([
      promptRow('edit a file'),
      assistantRow([useOf('Edit', { file_path: '/r/a.ts', old_string: 'a', new_string: 'b' })]),
      toolResultRow(),
    ])

    expect(turnFilesOf(turns, 1).map(file => file.path)).toEqual(['/r/a.ts'])
  })

  test('returns [] for an index no turn carries', () => {
    expect(turnFilesOf([], 3)).toEqual([])
  })
})

describe('changedFileOfTurnFile', () => {
  test('counts +/- lines across the hunks as adds/dels', () => {
    const file = {
      path: '/r/a.ts',
      hunks: [hunkOfChange('one\ntwo', 'ONE\ntwo\nTHREE')],
    }

    const changed = changedFileOfTurnFile(file)

    expect(changed).toEqual({
      path: '/r/a.ts',
      status: 'modified',
      adds: 3,
      dels: 2,
      isBinary: false,
    })
  })

  test('does not count a "\\ No newline at end of file" marker line', () => {
    const file = {
      path: '/r/a.ts',
      hunks: [
        {
          header: '@@ -1,1 +1,1 @@',
          text: '@@ -1,1 +1,1 @@\n-a\n\\ No newline at end of file\n+b\n\\ No newline at end of file\n',
        },
      ],
    }

    expect(changedFileOfTurnFile(file)).toEqual({
      path: '/r/a.ts',
      status: 'modified',
      adds: 1,
      dels: 1,
      isBinary: false,
    })
  })
})

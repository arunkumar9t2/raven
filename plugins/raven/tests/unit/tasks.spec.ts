import { describe, expect, test } from 'bun:test'
import { progressOf, TASK_TOOLS, type Tasks, tasksAfter } from '../../hooks/review/tasks'

describe('tasksAfter / TodoWrite', () => {
  test('replaces the list, indexing ids by position', () => {
    const tasks = tasksAfter(
      [],
      'TodoWrite',
      {
        todos: [
          { content: 'write tests', status: 'in_progress', activeForm: 'Writing tests' },
          { content: 'ship it', status: 'pending' },
        ],
      },
      undefined,
    )
    expect(tasks).toEqual([
      { id: '0', subject: 'write tests', status: 'in_progress', activeForm: 'Writing tests' },
      { id: '1', subject: 'ship it', status: 'pending' },
    ])
  })

  test('a later call fully replaces the previous list', () => {
    const first = tasksAfter(
      [],
      'TodoWrite',
      {
        todos: [
          { content: 'a', status: 'pending' },
          { content: 'b', status: 'pending' },
        ],
      },
      undefined,
    )
    const second = tasksAfter(
      first,
      'TodoWrite',
      {
        todos: [{ content: 'only one now', status: 'completed' }],
      },
      undefined,
    )
    expect(second).toEqual([{ id: '0', subject: 'only one now', status: 'completed' }])
  })
})

describe('tasksAfter / TaskCreate + TaskUpdate', () => {
  test('create takes its id from the result, then updates by that id', () => {
    let tasks: Tasks = tasksAfter([], 'TaskCreate', { subject: 'refactor foo' }, { task_id: 'abc' })
    expect(tasks).toEqual([{ id: 'abc', subject: 'refactor foo', status: 'pending' }])

    tasks = tasksAfter(tasks, 'TaskUpdate', { task_id: 'abc', status: 'in_progress' }, undefined)
    expect(tasks).toEqual([{ id: 'abc', subject: 'refactor foo', status: 'in_progress' }])

    tasks = tasksAfter(
      tasks,
      'TaskUpdate',
      { task_id: 'abc', status: 'completed', subject: 'refactor foo done' },
      undefined,
    )
    expect(tasks).toEqual([{ id: 'abc', subject: 'refactor foo done', status: 'completed' }])
  })

  test('falls back to an id on the input, then to the next index, when the result has none', () => {
    let tasks: Tasks = tasksAfter([], 'TaskCreate', { subject: 'a', task_id: 'from-input' }, {})
    expect(tasks[0]?.id).toBe('from-input')

    tasks = tasksAfter(tasks, 'TaskCreate', { subject: 'b' }, undefined)
    expect(tasks[1]?.id).toBe('1')
  })

  test('a deleted status removes the task', () => {
    let tasks: Tasks = tasksAfter([], 'TaskCreate', { subject: 'a' }, { task_id: '1' })
    tasks = tasksAfter(tasks, 'TaskUpdate', { task_id: '1', status: 'deleted' }, undefined)
    expect(tasks).toEqual([])
  })

  test('updating an unknown id is a no-op', () => {
    const tasks: Tasks = tasksAfter([], 'TaskCreate', { subject: 'a' }, { task_id: '1' })
    const after = tasksAfter(
      tasks,
      'TaskUpdate',
      { task_id: 'missing', status: 'completed' },
      undefined,
    )
    expect(after).toEqual(tasks)
  })
})

describe('tasksAfter / unknown tools and malformed input', () => {
  const seed: Tasks = tasksAfter([], 'TaskCreate', { subject: 'a' }, { task_id: '1' })

  test('an unrecognized tool leaves the list unchanged', () => {
    expect(tasksAfter(seed, 'Bash', { command: 'ls' }, { stdout: '' })).toEqual(seed)
  })

  test('malformed TodoWrite input leaves the list unchanged', () => {
    expect(tasksAfter(seed, 'TodoWrite', { todos: 'not an array' }, undefined)).toEqual(seed)
    expect(tasksAfter(seed, 'TodoWrite', { todos: [{ content: 'ok' }] }, undefined)).toEqual(seed)
    expect(tasksAfter(seed, 'TodoWrite', null, undefined)).toEqual(seed)
  })

  test('malformed TaskCreate input leaves the list unchanged', () => {
    expect(tasksAfter(seed, 'TaskCreate', { description: 'no subject' }, {})).toEqual(seed)
    expect(tasksAfter(seed, 'TaskCreate', 'not a record', {})).toEqual(seed)
  })

  test('malformed TaskUpdate input leaves the list unchanged', () => {
    expect(tasksAfter(seed, 'TaskUpdate', { status: 'completed' }, undefined)).toEqual(seed)
    expect(tasksAfter(seed, 'TaskUpdate', { task_id: '1', status: 'bogus' }, undefined)).toEqual(
      seed,
    )
  })
})

describe('progressOf', () => {
  test('undefined for an empty list', () => {
    expect(progressOf([])).toBeUndefined()
  })

  test('counts completed tasks against the total', () => {
    const tasks: Tasks = [
      { id: '0', subject: 'a', status: 'completed' },
      { id: '1', subject: 'b', status: 'in_progress' },
      { id: '2', subject: 'c', status: 'completed' },
    ]
    expect(progressOf(tasks)).toBe('2/3 done')
  })
})

describe('TASK_TOOLS', () => {
  test('names the three tools tasksAfter understands', () => {
    expect(TASK_TOOLS).toEqual(['TodoWrite', 'TaskCreate', 'TaskUpdate'])
  })

  test('TaskCreate reads the id from a text result and TaskUpdate addresses it by taskId', () => {
    const created = tasksAfter(
      [],
      'TaskCreate',
      { subject: 'Ship it' },
      'Task #12 created successfully',
    )
    const updated = tasksAfter(created, 'TaskUpdate', { taskId: '12', status: 'completed' }, null)
    expect(updated).toEqual([{ id: '12', subject: 'Ship it', status: 'completed' }])
  })
})

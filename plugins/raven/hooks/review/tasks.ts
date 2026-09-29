import { isRecord } from '../core/is-record'

export type TaskStatus = 'pending' | 'in_progress' | 'completed'
export type Task = { id: string; subject: string; status: TaskStatus; activeForm?: string }
export type Tasks = readonly Task[]

/** Tool names tasksAfter understands, for a trigger's filter. */
export const TASK_TOOLS: readonly string[] = ['TodoWrite', 'TaskCreate', 'TaskUpdate']

const STATUSES: readonly TaskStatus[] = ['pending', 'in_progress', 'completed']

function isStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value)
}

/** A task id from a tool's input or result: `taskId`/`task_id`/`id`, or `#N` in a text result. */
function idOf(value: unknown): string | undefined {
  if (typeof value === 'string') return /#(\d+)/.exec(value)?.[1]
  if (!isRecord(value)) return undefined
  const id =
    value.taskId ?? value.task_id ?? value.id ?? (isRecord(value.task) ? value.task.id : undefined)
  return typeof id === 'string' || typeof id === 'number' ? String(id) : undefined
}

function todoOf(value: unknown, id: string): Task | null {
  if (!isRecord(value)) return null
  const { content, status, activeForm } = value
  if (typeof content !== 'string' || !isStatus(status)) return null
  if (activeForm !== undefined && typeof activeForm !== 'string') return null
  return activeForm === undefined
    ? { id, subject: content, status }
    : { id, subject: content, status, activeForm }
}

/** TodoWrite replaces the whole list; a malformed `todos` array leaves the input `tasks` unchanged. */
function tasksFromTodoWrite(input: unknown): Tasks | null {
  if (!isRecord(input) || !Array.isArray(input.todos)) return null
  const tasks: Task[] = []
  for (const [index, todo] of input.todos.entries()) {
    const task = todoOf(todo, String(index))
    if (task === null) return null
    tasks.push(task)
  }
  return tasks
}

/** TaskCreate appends one task, pending; its id comes from the result, falling back to the input. */
function tasksFromCreate(tasks: Tasks, input: unknown, result: unknown): Tasks | null {
  if (!isRecord(input)) return null
  const subject = input.subject ?? input.task_subject
  if (typeof subject !== 'string') return null
  const activeForm = input.activeForm
  if (activeForm !== undefined && typeof activeForm !== 'string') return null
  const id = idOf(result) ?? idOf(input) ?? String(tasks.length)
  const task: Task =
    activeForm === undefined
      ? { id, subject, status: 'pending' }
      : { id, subject, status: 'pending', activeForm }
  return [...tasks, task]
}

/** TaskUpdate patches the task matching the input's id; a `deleted` status removes it. */
function tasksFromUpdate(tasks: Tasks, input: unknown): Tasks | null {
  if (!isRecord(input)) return null
  const id = idOf(input)
  if (id === undefined) return null

  const { status, subject, activeForm } = input
  if (status === 'deleted') return tasks.filter(task => task.id !== id)
  if (status !== undefined && !isStatus(status)) return null
  if (subject !== undefined && typeof subject !== 'string') return null
  if (activeForm !== undefined && typeof activeForm !== 'string') return null

  const index = tasks.findIndex(task => task.id === id)
  if (index === -1) return tasks

  const current = tasks[index] as Task
  const updated: Task = {
    ...current,
    ...(status !== undefined ? { status } : {}),
    ...(subject !== undefined ? { subject } : {}),
    ...(activeForm !== undefined ? { activeForm } : {}),
  }
  return tasks.map((task, i) => (i === index ? updated : task))
}

/** Folds one landed task-tool call into the list; unknown tools or malformed input leave it unchanged. `input` and `result` are the tool call's untrusted input and structured result. */
export function tasksAfter(tasks: Tasks, tool: string, input: unknown, result: unknown): Tasks {
  switch (tool) {
    case 'TodoWrite':
      return tasksFromTodoWrite(input) ?? tasks
    case 'TaskCreate':
      return tasksFromCreate(tasks, input, result) ?? tasks
    case 'TaskUpdate':
      return tasksFromUpdate(tasks, input) ?? tasks
    default:
      return tasks
  }
}

/** "3/7 done" style summary; undefined for an empty list. */
export function progressOf(tasks: Tasks): string | undefined {
  if (tasks.length === 0) return undefined
  const done = tasks.filter(task => task.status === 'completed').length
  return `${done}/${tasks.length} done`
}

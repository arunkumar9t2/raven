/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import type { Host } from '../core/host'
import type { Kit, View } from '../core/view'
import { TASKS_PANE } from '../names'
import { progressOf, type Tasks, tasksAfter } from '../review/tasks'

export type TasksView = View & {
  /** Folds a landed task-tool call in; true when the list changed. */
  apply: (tool: string, input: unknown, result: unknown) => boolean
  hasTasks: () => boolean
}

export function createTasksView(host: Host): TasksView {
  let tasks: Tasks = []

  function apply(tool: string, input: unknown, result: unknown): boolean {
    const next = tasksAfter(tasks, tool, input, result)
    if (next === tasks) return false
    tasks = next
    host.redraw()
    return true
  }

  function render(kit: Kit): RenderElement {
    const { Box, Text } = kit.ui
    const progress = progressOf(tasks)

    return (
      <Box flexDirection="column">
        <Text bold>{progress ?? 'No tasks yet.'}</Text>
        {tasks.map(task => (
          <Box key={task.id} flexDirection="row" gap={1}>
            {task.status === 'completed' ? (
              <Text dimColor>☑ {task.subject}</Text>
            ) : task.status === 'in_progress' ? (
              <Text>◐ {task.activeForm ?? task.subject}</Text>
            ) : (
              <Text>☐ {task.subject}</Text>
            )}
          </Box>
        ))}
      </Box>
    )
  }

  return {
    pane: TASKS_PANE,
    subcommand: 'tasks',
    render,
    apply,
    hasTasks: () => tasks.length > 0,
  }
}

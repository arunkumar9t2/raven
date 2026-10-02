/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS, TASK_STATE_COLORS, TASK_STATE_GLYPHS } from '../core/colors'
import type { Host } from '../core/host'
import type { Kit, View } from '../core/view'
import { TASKS_PANE } from '../names'
import { type Tasks, tasksAfter } from '../review/tasks'
import { progressBar } from '../ui/progress-bar'
import { sectionHeader } from '../ui/section-header'

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

  /**
   * A `sectionHeader` carrying the done/total `progressBar` on the right, then each task behind
   * a state dot — ○ pending, ◐ in progress, ● done — coloured by `TASK_STATE_COLORS`, D9's kit
   * applied to the Tasks pane.
   */
  function render(kit: Kit): RenderElement {
    const { Box, Text } = kit.ui
    if (tasks.length === 0) return <Text dimColor>No tasks yet.</Text>

    const done = tasks.filter(task => task.status === 'completed').length

    return (
      <Box flexDirection="column">
        {sectionHeader(kit, {
          title: 'Tasks',
          color: COLORS.accent,
          right: progressBar(kit, done, tasks.length),
        })}
        {tasks.map(task => (
          <Box key={task.id} flexDirection="row" gap={1}>
            <Text color={TASK_STATE_COLORS[task.status]}>{TASK_STATE_GLYPHS[task.status]}</Text>
            <Text dimColor={task.status === 'completed'} wrap="truncate-end">
              {task.status === 'in_progress' ? (task.activeForm ?? task.subject) : task.subject}
            </Text>
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

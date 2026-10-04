/* @jsxRuntime classic */
/* @jsx h */
/* @jsxFrag Fragment */
import type { RenderElement } from 'claude-code'

import { COLORS, TASK_STATE_COLORS, TASK_STATE_GLYPHS } from '../core/colors'
import type { Host } from '../core/host'
import type { Kit, View } from '../core/view'
import { TASKS_PANE } from '../names'
import { type Task, type Tasks, tasksAfter } from '../review/tasks'
import { EMPTY_ICONS, emptyState } from '../ui/empty'
import { progressBar } from '../ui/progress-bar'
import { sectionHeader } from '../ui/section-header'
import { gap, type KitRow, strip } from '../ui/strip'

/** The dim meta at a task row's right edge. */
const STATE_WORDS: Record<Task['status'], string> = {
  pending: 'pending',
  in_progress: 'in progress',
  completed: 'done',
}

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
   * a strip row led by a Nerd Font state icon (circle pending, dotted circle in progress, check
   * done) coloured by `TASK_STATE_COLORS`, the task text, and its state word dim at the right.
   */
  function render(kit: Kit): RenderElement {
    const { Box, Text } = kit.ui
    if (tasks.length === 0)
      return emptyState(
        kit,
        EMPTY_ICONS.tasks,
        "No tasks yet — Claude's task list shows up here as it plans",
      )

    const done = tasks.filter(task => task.status === 'completed').length

    // The header takes a row; the list is windowed to what is left so the strip's props stay bounded,
    // the first in-progress task kept in view, and a dim "… N more" row says what is cut.
    const room = Math.max(1, kit.rows - 1)
    const shownCount = tasks.length > room ? Math.max(1, room - 1) : tasks.length
    const active = tasks.findIndex(task => task.status === 'in_progress')
    const start = Math.max(0, Math.min(tasks.length - shownCount, active >= 0 ? active - 1 : 0))
    const windowed = tasks.slice(start, start + shownCount)
    const hidden = tasks.length - windowed.length
    const rows: KitRow[] = windowed.map(task => ({
      key: `task:${task.id}`,
      left: [
        { t: TASK_STATE_GLYPHS[task.status], c: TASK_STATE_COLORS[task.status] },
        gap(),
        {
          t: task.status === 'in_progress' ? (task.activeForm ?? task.subject) : task.subject,
          dim: task.status === 'completed',
          shrink: true,
        },
      ],
      right: [{ t: STATE_WORDS[task.status], dim: true }],
    }))

    return (
      <Box flexDirection="column">
        {sectionHeader(kit, {
          title: 'Tasks',
          color: COLORS.accent,
          right: progressBar(kit, done, tasks.length),
        })}
        {strip(kit, rows, { key: 'tasks', grow: 'stretch' })}
        {hidden > 0 ? (
          <Text key="tasks:more" dimColor>
            {`… ${hidden} more`}
          </Text>
        ) : null}
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

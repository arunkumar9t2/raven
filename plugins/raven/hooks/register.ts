import type { On } from 'claude-code'
import type { Host } from './core/host'
import { isRecord } from './core/is-record'
import { createRaven, type Raven } from './core/raven'
import type { ToolEvent } from './core/triggers'
import type { Ui } from './core/view'
import { COMMAND, COMMAND_DESCRIPTION, PANE_IDS } from './names'

/**
 * Raven's hooks: binds the engine once at `session.start`, then forwards commands, tool calls,
 * prompts and pane drawing to the controller in `core/raven`.
 */
export function register(on: On) {
  let raven: Raven | null = null

  on('session.start', async ($, e, next) => {
    const host: Host = {
      run: argv => $.process.run(argv),
      readFile: async path => {
        const text = await $.fs.read(path)
        return typeof text === 'string' ? text : ''
      },
      after: (ms, fn) => $.clock.after(ms, fn),
      redraw: () => $.ui.invalidate('ui.render'),
      openPane: async pane => (await $.ui.open(pane)).isPlaced,
      closePane: id => $.ui.close({ id }),
      isShown: async id => (await $.ui.panes()).some(pane => pane.id === id && pane.isShown),
      focus: async (paneId, key) => {
        await $.ui.focus({ requestId: paneId, key })
      },
      storeGet: key => $.store.get(key),
      storeSet: (key, value) => $.store.set(key, value),
      submitPrompt: async text => {
        await $.prompt.submit({ text })
      },
    }

    const created = createRaven(host, () => Date.now())
    await $.command.register({
      name: COMMAND,
      description: COMMAND_DESCRIPTION,
      argumentHint: created.argumentHint,
    })
    raven = created

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e, next) =>
    raven ? { text: await raven.command(e.args) } : next(e),
  )

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (!raven || !PANE_IDS.includes(e.requestId)) return next(e)
    const ui = (await $.ui.resolve(e)) as unknown as Ui
    const drawn = raven.render(e.requestId, {
      ui,
      columns: e.props.bodyColumns,
    })
    return drawn ?? next(e)
  })

  on('ui.close', { id: PANE_IDS }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) raven?.paneClosed(e.id)
    return result
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (!raven) return result

    const isLanded = result.deny === undefined && result.isError !== true
    const output = isLanded && isRecord(result.result) ? result.result : {}
    const event: ToolEvent = {
      tool: e.tool,
      input: isRecord(e) ? e : {},
      isLanded,
      agentId: e.agentId,
      stdout: typeof output.stdout === 'string' ? output.stdout : undefined,
    }

    const text = await raven.afterTool(event).catch(() => undefined)
    return text !== undefined && isLanded ? { ...result, text } : result
  })

  on('prompt.submit', ($, e, next) => {
    const review = raven?.takePromptContext()
    return review ? next({ ...e, context: [...(e.context ?? []), review] }) : next(e)
  })
}

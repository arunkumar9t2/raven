import type { On } from 'claude-code'
import { DIRECTIVE_OPS, withoutDirectives } from './core/directive'
import type { Host } from './core/host'
import { isRecord } from './core/is-record'
import { createRaven, type Raven } from './core/raven'
import type { ToolEvent } from './core/triggers'
import type { Ui } from './core/view'
import { COMMAND, COMMAND_DESCRIPTION, PANE_IDS, TOOL_NAME, toolNameOf } from './names'

// The plugin's own name is only known once `$` binds, so the tool's full name cannot be a static
// string here; this matches any plugin's `show` tool as `tool.call`'s matcher must be static.
const TOOL_MATCH = new RegExp(`^mcp__.+__${TOOL_NAME}$`)

const TOOL_DESCRIPTION =
  'Show something to the user in the Raven preview pane beside the transcript.'

const TOOL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    op: {
      enum: [...DIRECTIVE_OPS],
      description:
        "'show' renders a file at `path`; 'note' renders the markdown you compose; 'diff' opens " +
        "the diff, optionally at `path`; 'comments' reads the user's pending review comments.",
    },
    path: {
      type: 'string',
      description: 'A file path, relative to the session cwd unless absolute.',
    },
    markdown: { type: 'string', description: 'Markdown to render, for `op: "note"`.' },
    title: {
      type: 'string',
      description: 'A title for the pane, for `op: "show"` or `op: "note"`.',
    },
  },
  required: ['op'],
}

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
      cwd: () => $.session.cwd(),
      fork: async prompt => {
        const result = await $.model.fork({ prompt })
        return result.isAnswered ? result.text : null
      },
      status: text => $.ui.status(text),
    }

    const created = createRaven(host, () => Date.now())
    await $.command.register({
      name: COMMAND,
      description: COMMAND_DESCRIPTION,
      argumentHint: created.argumentHint,
    })
    await $.tool.register({
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      inputSchema: TOOL_INPUT_SCHEMA,
    })
    raven = created

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e, next) => {
    if (!raven) return next(e)
    const text = await raven.command(e.args).catch(error => `Raven failed: ${String(error)}`)
    return { text }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (!raven || !PANE_IDS.includes(e.requestId)) return next(e)
    const ui = (await $.ui.resolve(e)) as unknown as Ui
    const drawn = raven.render(e.requestId, {
      ui,
      columns: e.props.bodyColumns,
      rows: e.props.scroll.bodyRows,
    })
    return drawn ?? next(e)
  })

  on('ui.scroll', { requestId: PANE_IDS }, ($, e, next) => {
    if (!raven || e.origin.kind !== 'person' || !raven.scroll(e.requestId, e.by)) return next(e)
    $.ui.invalidate('ui.render')
    return {}
  })

  // A fork of its own answer raises no turn.complete the types promise, but the flag inside
  // `turnCompleted` guards it either way; `next(e)` runs first so this never slows the turn.
  on('turn.complete', ($, e, next) => {
    const result = next(e)
    if (raven && e.reason === 'answer' && e.agentId === undefined) void raven.turnCompleted(e)
    return result
  })

  on('ui.close', { id: PANE_IDS }, async ($, e, next) => {
    const result = await next(e)
    if (result.deny === undefined) raven?.paneClosed(e.id)
    return result
  })

  // Registered before the catch-all below: answering here without calling `next` keeps that hook
  // from also reacting to this call (a call no hook answers fails, so this one must answer).
  on('tool.call', { tool: TOOL_MATCH }, async ($, e, next) => {
    if (e.tool !== toolNameOf($.plugin.name) || !raven) return next(e)
    try {
      const text = await raven.runTool(e)
      return { result: text, text }
    } catch (error) {
      return { deny: error instanceof Error ? error.message : String(error) }
    }
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
      result: isLanded ? result.result : undefined,
    }

    const ack = await raven.afterTool(event).catch(() => undefined)
    if (ack === undefined || !isLanded || !isRecord(result.result)) return result
    // The model reads Bash's result from its `stdout`, so the ack replaces the CLI's lines there;
    // anything else the command printed stays.
    const rest = withoutDirectives(event.stdout ?? '')
    const text = rest === '' ? ack : `${rest}\n${ack}`
    return { ...result, result: { ...result.result, stdout: text }, text }
  })

  // Only a prompt the person sent (typed, or through Remote Control) carries the review.
  on('prompt.submit', ($, e, next) => {
    const isPersons = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    const review = isPersons ? raven?.takePromptContext() : undefined
    return review ? next({ ...e, context: [...(e.context ?? []), review] }) : next(e)
  })
}

import type { On } from 'claude-code'
import { describe, type Engine, expect, test, tier } from 'claude-code/testing'
import { DIFF_PANE, DOC_PANE, NAME, toolNameOf } from '../hooks/names'
import { baseWorld, PANE_PROPS, REPO, ran, ravenCommand, SESSION, trackShownPanes } from './helpers'

tier('user')

/** A world inside a git repo with one modified file, no hunks: enough to draw the diff pane. */
function world(on: On) {
  baseWorld(on)
  on('session.messages', () => ({ value: [] }))
  on('process.run', ($, e) => {
    const [cmd, sub] = e.argv
    if (cmd === 'git' && sub === 'rev-parse' && e.argv.includes('--show-toplevel')) {
      return ran(0, REPO)
    }
    if (cmd === 'git' && sub === 'status') return ran(0, ' M a.ts\0')
    if (cmd === 'git' && e.argv.includes('--numstat')) return ran(0, '1\t1\ta.ts\0')
    return ran(1)
  })

  trackShownPanes(on)
}

describe('surface safety', () => {
  test('the diff pane draws on both terminal and mobile, mobile carrying no Input', async ($: Engine, on: On) => {
    world(on)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    for (const surface of ['terminal', 'mobile'] as const) {
      const ui = await $.ui.mount({
        plugin: NAME,
        surface,
        component: 'Pane',
        props: PANE_PROPS,
        requestId: DIFF_PANE.id,
      })

      await expect(ui.drawn()).resolves.toBeDefined()
      expect(await ui.find({ text: 'a.ts' })).toBeDefined()

      if (surface === 'mobile') {
        expect(await ui.findAll({ type: 'Input' })).toHaveLength(0)
      }

      await ui.unmount()
    }
  })

  test('the diff pane draws on both terminal and desktop', async ($: Engine, on: On) => {
    world(on)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: NAME,
        surface,
        component: 'Pane',
        props: PANE_PROPS,
        requestId: DIFF_PANE.id,
      })

      await expect(ui.drawn()).resolves.toBeDefined()
      expect(await ui.find({ text: 'a.ts' })).toBeDefined()

      await ui.unmount()
    }
  })

  test('the doc pane draws a shown note on both terminal and desktop', async ($: Engine, on: On) => {
    world(on)

    await $.session.start(SESSION)
    await $.tool.call({
      tool: toolNameOf(NAME),
      op: 'note',
      markdown: 'Hello from the doc pane',
      title: 'Note',
    })

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({
        plugin: NAME,
        surface,
        component: 'Pane',
        props: { ...PANE_PROPS, title: 'Doc' },
        requestId: DOC_PANE.id,
      })

      await expect(ui.drawn()).resolves.toBeDefined()
      expect(await ui.find({ text: 'Hello from the doc pane' })).toBeDefined()

      await ui.unmount()
    }
  })
})

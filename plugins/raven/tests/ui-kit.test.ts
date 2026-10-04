import type { On, RenderElement } from 'claude-code'
import { describe, type Engine, expect, test, tier } from 'claude-code/testing'
import { COLORS } from '../hooks/core/colors'
import { capabilitiesOf, type Kit, type Ui } from '../hooks/core/view'
import { badge } from '../hooks/ui/badge'
import type { Chip } from '../hooks/ui/chips'
import { diffStat } from '../hooks/ui/diff-stat'
import { dot } from '../hooks/ui/dot'
import { progressBar } from '../hooks/ui/progress-bar'
import { sectionHeader } from '../hooks/ui/section-header'
import { statBar } from '../hooks/ui/stat-bar'
import { pillRow } from '../hooks/ui/strip'
import { baseWorld, SESSION } from './helpers'

tier('user')

/**
 * No Raven pane draws these kit components directly, so each test gives itself a component no real
 * hook claims (`InfoNotice`, terminal-only) and draws them through it with the surface's real
 * elements (`$.ui.resolve(e)`) — `$.ui.mount` then validates the tree exactly as it would a pane's.
 *
 * The capabilities are the terminal's with `keyboardControls` on (R42): the test's own hook is no
 * plugin module, so it cannot build a `Client`, and this is the plain-Button fallback the setting
 * selects.
 */
const KEYBOARD = capabilitiesOf('terminal', true)

/** Mounts `InfoNotice` drawing `draw(kit)`, and returns the drawing. */
async function mountKit($: Engine, on: On, draw: (kit: Kit) => RenderElement) {
  baseWorld(on)
  on('ui.render', { component: 'InfoNotice' }, async ($, e): Promise<RenderElement> => {
    const kit: Kit = {
      ui: (await $.ui.resolve(e)) as unknown as Ui,
      columns: 40,
      rows: 20,
      capabilities: KEYBOARD,
      press: () => {},
    }
    return draw(kit)
  })
  await $.session.start(SESSION)
  return $.ui.mount({
    plugin: 'raven',
    surface: 'terminal',
    component: 'InfoNotice',
    props: { text: 'kit', command: null },
  })
}

/** A pill row world: `chips` drawn as `mode` under `key`, the one factory every pill test shares. */
const pillRowWorld = (
  $: Engine,
  on: On,
  chips: Chip[],
  mode: 'words' | 'icons' | ('words' | 'icons')[],
  key: string,
) => mountKit($, on, kit => pillRow(kit, chips, mode, key))

const NOTE: Chip = { key: 'note', label: 'note', icon: '✎', onPress: () => {} }

describe('the UI kit draws on the terminal surface', () => {
  test('every component draws once, with no refusal', async ($: Engine, on: On) => {
    const ui = await mountKit(
      $,
      on,
      kit =>
        ({
          type: 'Box',
          props: { flexDirection: 'column' },
          children: [
            dot(kit, COLORS.accent),
            badge(kit, 6, COLORS.accent),
            diffStat(kit, 15, 12),
            statBar(kit, 3, 3, 5),
            progressBar(kit, 3, 5, 5),
            sectionHeader(kit, {
              dot: COLORS.added,
              title: '6 files',
              color: COLORS.accent,
              count: 6,
              right: 'source HEAD',
            }),
            pillRow(kit, [NOTE], 'words', 'kit-note'),
          ],
        }) as unknown as RenderElement,
    )

    await expect(ui.drawn()).resolves.toBeDefined()
    expect(await ui.find({ text: '6 files' })).toBeDefined()
  })
})

describe("pillRow's pills", () => {
  const CHIPS: Chip[] = [
    { key: 'quiet', label: 'note', icon: '✎', onPress: () => {} },
    { key: 'armed', label: 'sure?', icon: '↺', forceWords: true, onPress: () => {} },
  ]

  test('with keyboardControls a pill row draws plain Buttons keyed by the chips, no brackets', async ($: Engine, on: On) => {
    const ui = await pillRowWorld($, on, CHIPS, 'icons', 'toolbar-row')

    expect((await ui.find({ key: 'quiet' }))?.type).toBe('Button')
    expect((await ui.find({ key: 'armed' }))?.type).toBe('Button')
    expect((await ui.find({ key: 'toolbar-row:pills' }))?.text).not.toMatch(/[[\]]/)
  })

  test('a forceWords chip keeps its words even when the row draws icons', async ($: Engine, on: On) => {
    const ui = await pillRowWorld($, on, CHIPS, 'icons', 'toolbar-row')

    expect((await ui.find({ key: 'armed' }))?.props.label).toContain('↺ sure?')
    expect((await ui.find({ key: 'quiet' }))?.props.label).not.toContain('note')
  })

  test('a pill row beside a progress bar and a section header draws with no refusal', async ($: Engine, on: On) => {
    const ui = await mountKit($, on, kit =>
      sectionHeader(kit, {
        title: '6 files',
        color: COLORS.accent,
        right: pillRow(kit, [NOTE], 'words', 'chips-right'),
      }),
    )

    await expect(ui.drawn()).resolves.toBeDefined()
    expect(await ui.find({ text: '6 files' })).toBeDefined()
  })
})

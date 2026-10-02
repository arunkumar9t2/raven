import type { On, RenderElement } from 'claude-code'
import { describe, type Engine, expect, test, tier } from 'claude-code/testing'
import { COLORS } from '../hooks/core/colors'
import { FULL_CAPABILITIES, type Kit, type Ui } from '../hooks/core/view'
import { accentBar } from '../hooks/ui/accent-bar'
import { badge } from '../hooks/ui/badge'
import { chipRow } from '../hooks/ui/chips'
import { diffStat } from '../hooks/ui/diff-stat'
import { dot } from '../hooks/ui/dot'
import { meta } from '../hooks/ui/meta'
import { progressBar } from '../hooks/ui/progress-bar'
import { row } from '../hooks/ui/row'
import { sectionHeader } from '../hooks/ui/section-header'
import { statBar } from '../hooks/ui/stat-bar'
import { baseWorld, SESSION } from './helpers'

tier('user')

/**
 * No Raven pane draws the kit yet (wiring it in is a later task), so this test gives itself a
 * component no real hook claims (`InfoNotice`, terminal-only) and draws every kit component once
 * through it, with the surface's real elements (`$.ui.resolve(e)`) — so `$.ui.mount` validates
 * the tree exactly as it would a pane's.
 */
function world(on: On) {
  baseWorld(on)
  on('ui.render', { component: 'InfoNotice' }, async ($, e): Promise<RenderElement> => {
    const kit: Kit = {
      ui: (await $.ui.resolve(e)) as unknown as Ui,
      columns: 40,
      rows: 20,
      capabilities: FULL_CAPABILITIES,
    }

    return {
      type: 'Box',
      props: { flexDirection: 'column' },
      children: [
        dot(kit, COLORS.accent),
        badge(kit, 6, COLORS.accent),
        meta(kit, ['source HEAD', '2m']),
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
        row(kit, {
          left: 'src/api.ts',
          right: '+3 −3',
          key: 'kit-row',
          hover: { backgroundColor: COLORS.inactive },
        }),
        accentBar(kit, COLORS.suggestion),
        chipRow(kit, [{ key: 'note', label: 'note', icon: '✎', onPress: () => {} }], 'words'),
      ],
    }
  })
}

describe('the UI kit draws on the terminal surface', () => {
  test('every component draws once, with no refusal', async ($: Engine, on: On) => {
    world(on)

    await $.session.start(SESSION)
    const ui = await $.ui.mount({
      plugin: 'raven',
      surface: 'terminal',
      component: 'InfoNotice',
      props: { text: 'kit', command: null },
    })

    await expect(ui.drawn()).resolves.toBeDefined()
    expect(await ui.find({ text: '6 files' })).toBeDefined()
    expect(await ui.find({ text: 'src/api.ts' })).toBeDefined()
  })
})

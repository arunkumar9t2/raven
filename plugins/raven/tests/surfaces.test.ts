import type { On } from 'claude-code'
import { describe, type Engine, expect, test, tier } from 'claude-code/testing'
import { DIFF_PANE, DOC_PANE, NAME, toolNameOf } from '../hooks/names'
import { NOTE_GLYPH } from '../hooks/ui/icon-text'
import { commentButtonKeyOf } from '../hooks/views/diff/anchor'
import { baseWorld, PANE_PROPS, REPO, ran, ravenCommand, SESSION, trackShownPanes } from './helpers'

tier('user')

const HUNK_TEXT = '@@ -1,2 +1,2 @@\n a\n-b\n+c\n'

/** A world inside a git repo with one modified file carrying one hunk, so stage draws. */
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
    // The all-files bulk diff `loadAllHunks` issues (refresh): a real multi-file diff, sectioned
    // by `diff --git` lines, so `diffSectionsOf` can find a.ts's section.
    if (cmd === 'git' && e.argv.includes('-c')) {
      return ran(0, `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n${HUNK_TEXT}`)
    }
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
        expect(await ui.find({ text: NOTE_GLYPH })).toBeUndefined()
        expect(await ui.find({ text: 'stage' })).toBeDefined()
        expect(await ui.find({ text: /↺ revert/ })).toBeDefined()
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

  test('a note on a doc section draws on mobile with no Input, the chip gone too', async ($: Engine, on: On) => {
    world(on)
    on('fs.read', () => ({ value: '# Plan\n\nIntro\n\n## Goals\n\n- a\n' }))

    await $.session.start(SESSION)
    await $.tool.call({ tool: toolNameOf(NAME), op: 'show', path: '/work/plan.md' })

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'mobile',
      component: 'Pane',
      props: { ...PANE_PROPS, title: 'Doc' },
      requestId: DOC_PANE.id,
    })

    await expect(ui.drawn()).resolves.toBeDefined()
    expect(await ui.findAll({ type: 'Input' })).toHaveLength(0)
    // Goals is section index 1 (Plan is 0): no note chip (glyph + "note") control on a surface with no typing.
    expect(
      await ui.find({ key: commentButtonKeyOf({ path: '/work/plan.md', hunk: '§1' }) }),
    ).toBeUndefined()
    expect(await ui.find({ text: 'Goals' })).toBeDefined()
  })

  test('on mobile, the source picker falls back to plain buttons: no Select element', async ($: Engine, on: On) => {
    world(on)

    await $.session.start(SESSION)
    await $.command.run(ravenCommand('diff'))

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'mobile',
      component: 'Pane',
      props: PANE_PROPS,
      requestId: DIFF_PANE.id,
    })

    await expect(ui.drawn()).resolves.toBeDefined()
    expect(await ui.findAll({ type: 'Select' })).toHaveLength(0)
    expect(await ui.find({ type: 'Button', text: 'HEAD' })).toBeDefined()
  })

  test('on desktop, a shown png draws no Image element', async ($: Engine, on: On) => {
    world(on)

    await $.session.start(SESSION)
    await $.tool.call({ tool: toolNameOf(NAME), op: 'show', path: '/work/shot.png' })

    const ui = await $.ui.mount({
      plugin: NAME,
      surface: 'desktop',
      component: 'Pane',
      props: { ...PANE_PROPS, title: 'Doc' },
      requestId: DOC_PANE.id,
    })

    await expect(ui.drawn()).resolves.toBeDefined()
    expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
    expect(await ui.find({ text: '/work/shot.png' })).toBeDefined()
  })
})

describe('doc tables', () => {
  const PROSE =
    'The engine **sizes GFM tables to the terminal width**, not the pane, so every row wraps and the `box borders` break apart into stray characters when the pane is narrower than the terminal.'
  const MARKDOWN = `Before\n\n| Path | What Claude sees |\n| --- | --- |\n| \`a.ts\` | ${PROSE} |\n| b.ts | ok |\n\nAfter`

  const textLines = async (ui: { findAll: (q: { type: 'Text' }) => Promise<{ text: string }[]> }) =>
    (await ui.findAll({ type: 'Text' })).map(each => each.text).filter(text => !text.includes('\n'))
  const GLYPHS = /[│┌└├╭╰]/

  // The table's own rows: the lines from the header row ("Path") through the last row ("b.ts").
  const tableLinesOf = (lines: string[]) => {
    const first = lines.findIndex(text => text.includes('Path'))
    const last = lines.findIndex(text => text.includes('b.ts'))
    return lines.slice(first, last + 1)
  }

  test('under the default bar style a table is a header, one rule and the rows, fitted to the pane', async ($: Engine, on: On) => {
    world(on)
    await $.session.start(SESSION)
    await $.tool.call({ tool: toolNameOf(NAME), op: 'note', markdown: MARKDOWN, title: 'Table' })

    for (const bodyColumns of [100, 70]) {
      const ui = await $.ui.mount({
        plugin: NAME,
        surface: 'terminal',
        component: 'Pane',
        props: { ...PANE_PROPS, title: 'Doc', bodyColumns },
        requestId: DOC_PANE.id,
      })
      await expect(ui.drawn()).resolves.toBeDefined()

      const lines = await textLines(ui)
      const rows = tableLinesOf(lines)
      // The engine reports a row's text both whole and in pieces, so count distinct rules.
      expect(new Set(rows.filter(text => /^─+$/.test(text)))).toHaveProperty('size', 1)
      expect(rows.some(text => GLYPHS.test(text))).toBe(false)
      for (const text of rows) expect([...text].length).toBeLessThanOrEqual(bodyColumns - 1)

      await ui.unmount()
    }
  })

  for (const [cardStyle, top, bottom] of [
    ['sharp', '┌', '└'],
    ['rounded', '╭', '╰'],
  ] as const) {
    test(
      `under ${cardStyle} a table is a full grid with ${top} ${bottom} corners, fitted to the pane`,
      { options: { cardStyle } },
      async ($: Engine, on: On) => {
        world(on)
        await $.session.start(SESSION)
        await $.tool.call({
          tool: toolNameOf(NAME),
          op: 'note',
          markdown: MARKDOWN,
          title: 'Table',
        })

        for (const bodyColumns of [100, 70]) {
          const ui = await $.ui.mount({
            plugin: NAME,
            surface: 'terminal',
            component: 'Pane',
            props: { ...PANE_PROPS, title: 'Doc', bodyColumns },
            requestId: DOC_PANE.id,
          })
          await expect(ui.drawn()).resolves.toBeDefined()

          // The grid's own rows: from the top border through the bottom one.
          const all = await textLines(ui)
          const lines = all.slice(
            all.findIndex(text => text.startsWith(top)),
            all.findIndex(text => text.startsWith(bottom)) + 1,
          )
          expect(lines.some(text => text.startsWith(top))).toBe(true)
          expect(lines.some(text => text.startsWith(bottom))).toBe(true)
          expect(lines.length).toBeGreaterThan(5)
          for (const text of lines) expect([...text].length).toBeLessThanOrEqual(bodyColumns - 1)

          await ui.unmount()
        }
      },
    )
  }
})

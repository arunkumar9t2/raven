import { describe, expect, test } from 'bun:test'
import type { Kit } from '../../hooks/core/view'
import type { Run } from '../../hooks/git/load'
import { createReview } from '../../hooks/review/review'
import { styleOf } from '../../hooks/ui/style'
import { widthOf } from '../../hooks/ui/wrap'
import { cancelKeyOf, commentButtonKeyOf, inputKeyOf } from '../../hooks/views/diff/anchor'
import { createDiffView, type DiffActions } from '../../hooks/views/diff-view'
import { fakeHost } from './fake-host'

/**
 * `createDiffView`'s render functions compile to bare `h(...)` calls (the mod sandbox's classic
 * JSX runtime, see `types/claude-code.d.ts`); outside that sandbox nothing supplies `h`, so these
 * specs supply a minimal one themselves (a plain-data tree a test can walk) rather than run the
 * view through the mod-kit sandbox, where a press can't be driven until *after* a render that
 * would already have resolved `pendingReveal`, hiding the race these tests target (confirmed: a
 * mod-kit press after the debounced refresh still passed with the bug reintroduced, because
 * `ui.press` itself pulls a fresh render first).
 */
type Node = { type: unknown; props: Record<string, unknown> }

function h(tag: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Node {
  return { type: tag, props: { ...(props ?? {}), children } }
}

function Fragment(props: Record<string, unknown>): Node {
  return { type: 'Fragment', props }
}

;(globalThis as Record<string, unknown>).h = h
;(globalThis as Record<string, unknown>).Fragment = Fragment

const Box = () => null
const Text = () => null
const Button = () => null
const Code = () => null
const Markdown = () => null

const KIT = {
  ui: { Box, Text, Button, Code, Markdown },
  columns: 100,
  rows: 7,
  capabilities: { canType: true, canPick: true, canShowImage: true, canClient: false },
  style: styleOf('bar'),
  press: () => {},
} as unknown as Kit

function flatten(children: unknown): unknown[] {
  if (children == null || children === false) return []
  if (Array.isArray(children)) return children.flatMap(flatten)
  return [children]
}

function findAll(node: unknown, predicate: (n: Node) => boolean, out: Node[] = []): Node[] {
  for (const n of flatten(node)) {
    const current = n as Node
    if (predicate(current)) out.push(current)
    findAll(current.props?.children, predicate, out)
  }
  return out
}

const findByKey = (tree: unknown, key: string): Node | undefined =>
  findAll(tree, n => n.props?.key === key)[0]

function textUnder(node: unknown): string {
  return flatten(node)
    .map(n => {
      if (typeof n === 'string' || typeof n === 'number') return String(n)
      const current = n as Node
      return textUnder(current.props?.children)
    })
    .join('')
}

const REPO = '/work'

/** A `Run` serving `a.ts` and `b.ts` as two modified, hunk-less files under `/work`. */
const runOf = (): Run => {
  const outputs: Record<string, { exitCode?: number; stdout?: string }> = {
    'git rev-parse --show-toplevel': { stdout: `${REPO}\n` },
    'git status --porcelain=v1 -z --untracked-files=all': { stdout: ' M a.ts\0 M b.ts\0' },
    'git diff HEAD --numstat -z': { stdout: '1\t1\ta.ts\x001\t1\tb.ts\x00' },
  }
  return async argv => {
    const out = outputs[argv.join(' ')]
    return { exitCode: out?.exitCode ?? (out ? 0 : 1), stdout: out?.stdout ?? '', stderr: '' }
  }
}

const NO_ACTIONS: DiffActions = {
  send: () => {},
  editAndSend: () => {},
  focus: async () => {},
}

describe('createDiffView', () => {
  test("pressing a file row applies even when a follow's pendingReveal is still latched", async () => {
    const host = fakeHost({ run: runOf() })
    const review = createReview(host, () => 0)
    const view = createDiffView(host, review, NO_ACTIONS, () => 0)

    await view.refresh()
    // rows=7 at 100 columns: the header is one row, so fixedRowsOf(2 files, 8, 1) = 4, leaving 3
    // body rows: a.ts's card, so only a stream jump to b.ts (4 rows down) changes which heading is
    // in view.
    let tree = view.render(KIT)
    const pressA = () => {
      const onPress = findByKey(tree, 'file:a.ts')?.props.onPress as (() => void) | undefined
      onPress?.()
    }

    // An edit on b.ts, with follow still on, then the debounced refresh that would apply it.
    view.noteEdited(`${REPO}/b.ts`)
    await view.refresh()

    // The person's click, before any further render has had a chance to apply that follow.
    pressA()

    tree = view.render(KIT)
    expect(findByKey(tree, 'a.ts#title')).toBeDefined()
    expect(findByKey(tree, 'b.ts#title')).toBeUndefined()
    expect(textUnder(findByKey(tree, 'row:file:a.ts'))).toContain('❯')
  })

  test("scrolling applies even when a follow's pendingReveal is still latched", async () => {
    const host = fakeHost({ run: runOf() })
    const review = createReview(host, () => 0)
    const view = createDiffView(host, review, NO_ACTIONS, () => 0)

    await view.refresh()
    view.render(KIT)

    // An edit on b.ts, with follow still on, then the debounced refresh that would apply it.
    view.noteEdited(`${REPO}/b.ts`)
    await view.refresh()

    // The person scrolls up (already at the top, so this is a no-op move that still drops
    // follow), before any further render has had a chance to apply the latched follow.
    view.scroll?.(-1)

    const tree = view.render(KIT)
    expect(findByKey(tree, 'a.ts#title')).toBeDefined()
    expect(findByKey(tree, 'b.ts#title')).toBeUndefined()
  })

  test('closing the compose box focuses the note button only where it is a keyed element', async () => {
    for (const canClient of [true, false]) {
      const focused: string[] = []
      const handlers = new Map<string, () => void>()
      const kit = {
        ...KIT,
        ui: { ...KIT.ui, Client: () => null, Input: () => null, Select: () => null },
        capabilities: { ...KIT.capabilities, canClient },
        press: (id: string, fn: () => void) => handlers.set(id, fn),
      } as unknown as Kit
      const host = fakeHost({ run: runOf() })
      const view = createDiffView(
        host,
        createReview(host, () => 0),
        { ...NO_ACTIONS, focus: async key => void focused.push(key) },
        () => 0,
      )
      await view.refresh()
      const anchor = { path: 'a.ts' }
      view.render(kit)
      // On a Client surface the note pill is a press handler; elsewhere a Button's onPress.
      const open = canClient
        ? handlers.get(commentButtonKeyOf(anchor))
        : (findByKey(view.render(kit), commentButtonKeyOf(anchor))?.props.onPress as () => void)
      open?.()
      expect(focused).toEqual([inputKeyOf(anchor)])
      const tree = view.render(kit)
      const cancel = canClient
        ? handlers.get(cancelKeyOf(anchor))
        : (findByKey(tree, cancelKeyOf(anchor))?.props.onPress as () => void)
      cancel?.()
      expect(focused.includes(commentButtonKeyOf(anchor))).toBe(!canClient)
    }
  })

  test('a frame style closes each card with a close row; bar and none draw none', async () => {
    for (const [name, hasClose] of [
      ['bar', false],
      ['none', false],
      ['sharp', true],
      ['rounded', true],
    ] as const) {
      const kit = { ...KIT, rows: 30, style: styleOf(name) } as unknown as Kit
      const host = fakeHost({ run: runOf() })
      const view = createDiffView(
        host,
        createReview(host, () => 0),
        NO_ACTIONS,
        () => 0,
      )
      await view.refresh()
      const tree = view.render(kit)
      expect(findByKey(tree, 'a.ts#close') !== undefined).toBe(hasClose)
      expect(findByKey(tree, 'a.ts#title')).toBeDefined()
    }
  })
})

/** What a node draws: its text children and a Button's `label`, less a rule's 400-cell `─` fill. */
function drawnOf(node: unknown): string {
  return flatten(node)
    .map(n => {
      if (typeof n === 'string' || typeof n === 'number') {
        const text = String(n)
        return /^─{100,}$/.test(text) ? '' : text
      }
      const current = n as Node
      const label = typeof current.props?.label === 'string' ? current.props.label : ''
      return label + drawnOf(current.props?.children)
    })
    .join('')
}

const HUNK = '@@ -1,2 +1,2 @@\n a\n-b\n+c\n'
const sectionOf = (path: string) =>
  `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n${HUNK}`

/** A `Run` serving the given status/numstat/diff text for a repository under `/work`. */
const worldOf = (world: { status: string; numstat: string; diff?: string }): Run => {
  const diffArgv = 'git -c core.quotePath=false diff -M HEAD'
  const outputs: Record<string, string | undefined> = {
    'git rev-parse --show-toplevel': `${REPO}\n`,
    'git status --porcelain=v1 -z --untracked-files=all': world.status,
    'git diff HEAD --numstat -z': world.numstat,
    [diffArgv]: world.diff,
  }
  return async argv => {
    const out = outputs[argv.join(' ')]
    return { exitCode: out === undefined ? 1 : 0, stdout: out ?? '', stderr: '' }
  }
}

const STYLES = ['bar', 'none', 'sharp', 'rounded'] as const

async function renderedAs(run: Run, name: (typeof STYLES)[number], columns: number) {
  const kit = { ...KIT, columns, rows: 60, style: styleOf(name) } as unknown as Kit
  const host = fakeHost({ run })
  const view = createDiffView(
    host,
    createReview(host, () => 0),
    NO_ACTIONS,
    () => 0,
  )
  await view.refresh()
  return view.render(kit)
}

describe('file cards as drawn at a narrow pane', () => {
  const twoFiles = worldOf({
    status: ' M a.ts\0 M b.ts\0',
    numstat: '1\t1\ta.ts\x001\t1\tb.ts\x00',
    diff: sectionOf('a.ts') + sectionOf('b.ts'),
  })

  test('under every style the title and label rows fit 30 columns', async () => {
    for (const name of STYLES) {
      const tree = await renderedAs(twoFiles, name, 30)
      for (const path of ['a.ts', 'b.ts']) {
        const title = drawnOf(findByKey(tree, `${path}#title`))
        const label = drawnOf(findByKey(tree, `${path}#hunk-header:${path}|@@ -1,2 +1,2 @@`))
        // The chips sit two columns after their row's text (`gap={2}`), which is not itself text.
        expect(widthOf(title) + 2).toBeLessThanOrEqual(30)
        expect(widthOf(label) + 2).toBeLessThanOrEqual(30)
      }
    }
  })

  test('under every style the chips shrink to bare icons once the pane is too narrow for words', async () => {
    for (const name of STYLES) {
      const tree = await renderedAs(twoFiles, name, 22)
      const title = drawnOf(findByKey(tree, 'a.ts#title'))
      const label = drawnOf(findByKey(tree, 'a.ts#hunk-header:a.ts|@@ -1,2 +1,2 @@'))
      // (The path itself truncates by the engine at this width, so only the chips are asserted.)
      expect(title).toContain('✎')
      expect(title).not.toContain('note')
      expect(label).toContain('✓')
      expect(label).not.toContain('stage')
      expect(label).not.toContain('revert')
    }
  })

  test('a renamed file shows only its new path', async () => {
    const renamed = worldOf({
      status: 'R  new.ts\0old.ts\0',
      numstat: '1\t1\t\0old.ts\0new.ts\0',
      diff: `diff --git a/old.ts b/new.ts\nsimilarity index 80%\nrename from old.ts\nrename to new.ts\n--- a/old.ts\n+++ b/new.ts\n${HUNK}`,
    })
    for (const name of STYLES) {
      const tree = await renderedAs(renamed, name, 60)
      const title = drawnOf(findByKey(tree, 'new.ts#title'))
      expect(title).toContain('new.ts')
      expect(title).not.toContain('old.ts')
    }
  })

  test('a binary and a not-read file draw their status as one railed body row; bar draws no close row', async () => {
    const binary = worldOf({
      status: ' M pic.png\0',
      numstat: '-\t-\tpic.png\x00',
      diff: '',
    })
    const unread = worldOf({
      status: ' M a.ts\0',
      numstat: '1\t1\ta.ts\x00',
    })
    for (const [run, path, text] of [
      [binary, 'pic.png', 'Binary file'],
      [unread, 'a.ts', 'Not read'],
    ] as const) {
      for (const name of STYLES) {
        const tree = await renderedAs(run, name, 60)
        const status = findByKey(tree, `${path}#status`)
        const drawn = drawnOf(status)
        expect(drawn).toContain(text)
        const rail = { bar: '▌ ', none: '', sharp: '│ ', rounded: '│ ' }[name]
        expect(drawn.startsWith(rail)).toBe(true)
        expect(findByKey(tree, `${path}#close`) !== undefined).toBe(
          name === 'sharp' || name === 'rounded',
        )
      }
    }
  })
})

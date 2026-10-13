import { describe, expect, test } from 'bun:test'
import type { Kit } from '../../hooks/core/view'
import type { Run } from '../../hooks/git/load'
import { createReview } from '../../hooks/review/review'
import { NOTE_GLYPH } from '../../hooks/ui/icon-text'
import { styleOf } from '../../hooks/ui/style'
import { widthOf } from '../../hooks/ui/wrap'
import { cancelKeyOf, commentButtonKeyOf, inputKeyOf } from '../../hooks/views/diff/anchor'
import { note, orphanPathRow } from '../../hooks/views/diff/comment-box'
import {
  type HeaderProps,
  header,
  headerPlanFor,
  SOURCE_SELECT_KEY,
} from '../../hooks/views/diff/header'
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
      expect(title).toContain(NOTE_GLYPH)
      expect(title).not.toContain('note')
      expect(label).toContain('✓')
      expect(label).not.toContain('stage')
      expect(label).not.toContain('revert')
    }
  })

  test('the blank row under a title draws no rail in bar, and the frame sides in sharp and rounded', async () => {
    for (const [name, expected] of [
      ['bar', ' '],
      ['none', ' '],
      ['sharp', '│ '],
      ['rounded', '│ '],
    ] as const) {
      const tree = await renderedAs(twoFiles, name, 60)
      const drawn = drawnOf(findByKey(tree, 'a.ts#title-gap'))
      expect(drawn).not.toContain('▌')
      expect(drawn.startsWith(expected)).toBe(true)
      expect(drawn.includes('│')).toBe(name === 'sharp' || name === 'rounded')
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

describe('rows the review found miscounted or misrouted', () => {
  const wideKit = (columns: number, name: (typeof STYLES)[number] = 'bar') =>
    ({
      ...KIT,
      ui: { ...KIT.ui, Select: () => null },
      columns,
      rows: 60,
      style: styleOf(name),
    }) as unknown as Kit

  async function viewOver(run: Run) {
    const host = fakeHost({ run })
    const view = createDiffView(
      host,
      createReview(host, () => 0),
      NO_ACTIONS,
      () => 0,
    )
    await view.refresh()
    return view
  }

  test('M1: a file literally named `orphans` draws its title and hunk, not zero-height orphan rows', async () => {
    const run = worldOf({
      status: ' M orphans\0',
      numstat: '1\t1\torphans\x00',
      diff: sectionOf('orphans'),
    })
    for (const name of STYLES) {
      const tree = (await viewOver(run)).render(wideKit(80, name))
      expect(drawnOf(findByKey(tree, 'orphans#title'))).toContain('orphans')
      expect(findAll(tree, n => n.type === Code).length).toBeGreaterThan(0)
    }
  })

  test('M5: a title shows only the non-zero counts', async () => {
    const run = worldOf({
      status: ' M new.ts\0 M bin.dat\0',
      numstat: '3\t0\tnew.ts\x00-\t-\tbin.dat\x00',
    })
    const tree = (await viewOver(run)).render(wideKit(80))
    const added = drawnOf(findByKey(tree, 'new.ts#title'))
    expect(added).toContain('+3')
    expect(added).not.toContain('−0')
    const binary = drawnOf(findByKey(tree, 'bin.dat#title'))
    expect(binary).not.toContain('+0')
    expect(binary).not.toContain('−0')
  })

  test('M3: the whole-file `\\ No newline` tail truncates, so it is always one row', async () => {
    const run = worldOf({
      status: 'A  n.ts\0',
      numstat: '1\t0\tn.ts\x00',
      diff: 'diff --git a/n.ts b/n.ts\nnew file mode 100644\n--- /dev/null\n+++ b/n.ts\n@@ -0,0 +1 @@\n+x\n\\ No newline at end of file\n',
    })
    const tree = (await viewOver(run)).render(wideKit(80, 'none'))
    const tails = findAll(tree, n => n.type === Text && drawnOf(n).startsWith('\\ No newline'))
    expect(tails.length).toBeGreaterThan(0)
    for (const tail of tails) expect(tail.props.wrap).toBe('truncate-end')
  })

  test('M6: with no added or deleted lines the header draws no empty stat element', async () => {
    const run = worldOf({ status: ' M pic.png\0', numstat: '-\t-\tpic.png\x00', diff: '' })
    const tree = (await viewOver(run)).render(wideKit(120))
    const row = findByKey(tree, 'header:row')
    const cluster = flatten(row?.props.children)[0] as Node
    const empty = flatten(cluster.props.children).filter(
      n => (n as Node).type === Text && drawnOf(n) === '',
    )
    expect(empty).toEqual([])
  })

  test('I2: the source picker draws a long selected turn label cut to the cap the plan counts', () => {
    const label = `turn 12: ${'Refactor the authentication middleware '.repeat(2)}`
    const kit = wideKit(200)
    const props: HeaderProps = {
      files: [],
      edited: new Set(),
      pending: 0,
      confirmingClear: false,
      sourceValue: 'turn:12',
      sourceOptions: [
        { value: 'head', label: 'HEAD' },
        { value: 'turn:12', label },
      ],
      onSourceChange() {},
      onRefresh() {},
      isSplit: false,
      onToggleSplit() {},
      onSend() {},
      onEditSend() {},
      onPrevious() {},
      onNext() {},
      onClear() {},
    }
    const plan = headerPlanFor(kit, props)
    const select = findByKey(header(kit, props, plan), SOURCE_SELECT_KEY)
    const options = select?.props.options as { value: string; label?: string }[]
    const shown = options.find(option => option.value === 'turn:12')?.label ?? ''
    expect(widthOf(shown)).toBeLessThanOrEqual(24)
    expect(shown.endsWith('…')).toBe(true)
    // The other options keep their full labels in the list.
    expect(options.find(option => option.value === 'head')?.label).toBe('HEAD')
  })

  test('M8: a note header is one truncating Text, so it cannot wrap at a narrow pane', () => {
    const comment = {
      id: 'c1',
      path: 'a.ts',
      line: { number: 3 },
      text: 'hello',
      status: 'open',
      createdAt: 0,
    } as unknown as Parameters<typeof note>[1]
    for (const status of ['pending', 'open', 'addressed'] as const) {
      const tree = note(
        wideKit(30),
        { ...comment, status },
        ['hello'],
        60_000,
        () => {},
        () => {},
      )
      const header = findAll(
        tree,
        n => n.type === Text && n.props.wrap === 'truncate-end' && drawnOf(n).includes(' · '),
      )
      expect(header.length).toBe(1)
    }
  })

  test('M3: a status row ("Binary file", "Not read") truncates, so it is one row under none', async () => {
    const run = worldOf({ status: ' M pic.png\0', numstat: '-\t-\tpic.png\x00', diff: '' })
    const tree = (await viewOver(run)).render(wideKit(14, 'none'))
    const status = findByKey(tree, 'pic.png#status')
    const texts = findAll(status, n => n.type === Text && drawnOf(n).includes('Binary'))
    expect(texts.length).toBe(1)
    expect(texts[0]?.props.wrap).toBe('truncate-end')
  })

  test('M9: an orphan path row is one row: the path truncates, "file gone" never shrinks or wraps', () => {
    const tree = orphanPathRow(wideKit(40), `packages/${'deep/'.repeat(14)}gone.ts`, true)
    const path = findAll(tree, n => n.type === Text && n.props.bold === true)[0]
    expect(path?.props.wrap).toBe('truncate-end')
    const gone = findAll(tree, n => n.type === Text && drawnOf(n) === 'file gone')[0]
    expect(gone?.props.wrap).toBe('truncate-end')
    const goneHolder = findAll(tree, n => n.type === Box && n.props.flexShrink === 0)
    expect(goneHolder.length).toBe(1)
    const pathHolder = findAll(tree, n => n.type === Box && n.props.flexShrink === 1)
    expect(pathHolder.length).toBe(1)
  })
})

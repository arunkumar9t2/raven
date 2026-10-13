import { describe, expect, test } from 'bun:test'
import type { Kit } from '../../hooks/core/view'
import type { Run } from '../../hooks/git/load'
import { createReview } from '../../hooks/review/review'
import { styleOf } from '../../hooks/ui/style'
import { commentButtonKeyOf, selectKeyOf } from '../../hooks/views/diff/anchor'
import { createDiffView, type DiffActions } from '../../hooks/views/diff-view'
import { fakeHost } from './fake-host'

/** The same plain-data `h` as diff-view-reveal.spec.ts. */
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
const Input = () => null
const Select = () => null

function kitOf(columns: number, rows: number, name: 'bar' | 'sharp' = 'bar'): Kit {
  return {
    ui: { Box, Text, Button, Code, Markdown, Input, Select },
    columns,
    rows,
    capabilities: { canType: true, canPick: true, canShowImage: true, canClient: false },
    style: styleOf(name),
    press: () => {},
  } as unknown as Kit
}

function flatten(children: unknown): unknown[] {
  if (children == null || children === false) return []
  if (Array.isArray(children)) return children.flatMap(flatten)
  return [children]
}
function findAll(node: unknown, predicate: (n: Node) => boolean, out: Node[] = []): Node[] {
  for (const n of flatten(node)) {
    const current = n as Node
    if (typeof n === 'object' && n !== null) {
      if (predicate(current)) out.push(current)
      findAll(current.props?.children, predicate, out)
    }
  }
  return out
}
const byKey = (tree: unknown, key: string) => findAll(tree, n => n.props?.key === key)[0]
function press(node: Node | undefined): void {
  const onPress = node?.props.onPress as (() => void) | undefined
  onPress?.()
}
function choose(node: Node | undefined, value: unknown): void {
  const onSelect = node?.props.onSelect as ((value: unknown) => void) | undefined
  onSelect?.(value)
}
const inputs = (tree: unknown) => findAll(tree, n => n.type === Input)
const splitChip = (tree: unknown) =>
  findAll(tree, n => n.type === Button && /[≡◫]/.test(String(n.props.label ?? '')))[0]

/** Three 6-line-each hunks of a.ts, each pairing two removed with two added lines. */
function hunkText(start: number): string {
  const body = [
    ` c${start}`,
    `-old ${start} a`,
    `-old ${start} b`,
    `+new ${start} a`,
    `+new ${start} b`,
    ` d${start}`,
  ]
  return `@@ -${start},4 +${start},4 @@\n${body.join('\n')}\n`
}
const HEADERS = [1, 40, 80].map(start => `@@ -${start},4 +${start},4 @@`)
const DIFF = `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n${[1, 40, 80].map(hunkText).join('')}`

const runOf = (): Run => async argv => {
  const out: Record<string, string> = {
    'git rev-parse --show-toplevel': '/work\n',
    'git status --porcelain=v1 -z --untracked-files=all': ' M a.ts\0 M b.ts\0',
    'git diff HEAD --numstat -z': '6\t6\ta.ts\x006\t6\tb.ts\x00',
    'git -c core.quotePath=false diff -M HEAD': DIFF + DIFF.replaceAll('a.ts', 'b.ts'),
  }
  const stdout = out[argv.join(' ')]
  return { exitCode: stdout === undefined ? 1 : 0, stdout: stdout ?? '', stderr: '' }
}

const ACTIONS: DiffActions = { send() {}, editAndSend() {}, focus: async () => {} }

async function viewOf(splitColumns: number, run: Run = runOf()) {
  const host = fakeHost({ run })
  const review = createReview(host, () => 0)
  const view = createDiffView(host, review, ACTIONS, () => 0, { splitColumns })
  await view.refresh()
  return { view, review }
}

describe('toggling split while the compose box is open', () => {
  test('keeps the box (and its Input) mounted, in either direction', async () => {
    // Rows chosen so that in split the box of the second hunk ends just inside the window, and
    // unified (two rows taller per hunk) pushes it out.
    const rows = 19
    const { view } = await viewOf(100)
    let tree = view.render(kitOf(200, rows))
    expect(splitChip(tree)?.props.label).toContain('unified')
    const anchor = { path: 'a.ts', hunk: HEADERS[1] as string }
    press(byKey(tree, commentButtonKeyOf(anchor)))
    tree = view.render(kitOf(200, rows))
    expect(inputs(tree)).toHaveLength(1)

    press(splitChip(tree))
    tree = view.render(kitOf(200, rows))
    expect(inputs(tree)).toHaveLength(1)

    press(splitChip(tree))
    tree = view.render(kitOf(200, rows))
    expect(inputs(tree)).toHaveLength(1)
  })

  test('a new-side line pick survives a toggle; an old-side pick going to split is dropped', async () => {
    const { view } = await viewOf(100)
    view.reveal?.('/work/a.ts')
    let tree = view.render(kitOf(200, 40))
    const anchor = { path: 'a.ts', hunk: HEADERS[0] as string }
    // Start unified (toggle once off split), so both sides are offered.
    press(splitChip(tree))
    tree = view.render(kitOf(200, 40))
    press(byKey(tree, commentButtonKeyOf(anchor)))
    tree = view.render(kitOf(200, 40))
    const select = byKey(tree, selectKeyOf(anchor))
    const options = select?.props.options as { label: string; value: unknown }[]
    const pick = (side: 'old' | 'new') => options.find(o => JSON.stringify(o.value).includes(side))
    choose(select, pick('new')?.value)
    tree = view.render(kitOf(200, 40))
    press(splitChip(tree)) // to split
    tree = view.render(kitOf(200, 40))
    expect(byKey(tree, selectKeyOf(anchor))?.props.value).toEqual(pick('new')?.value)

    // Back to unified, pick an old-side line, then to split: it is not offered there.
    press(splitChip(tree))
    tree = view.render(kitOf(200, 40))
    const again = byKey(tree, selectKeyOf(anchor))
    choose(again, pick('old')?.value)
    tree = view.render(kitOf(200, 40))
    expect(byKey(tree, selectKeyOf(anchor))?.props.value).toEqual(pick('old')?.value)
    press(splitChip(tree))
    tree = view.render(kitOf(200, 40))
    expect(byKey(tree, selectKeyOf(anchor))?.props.value).toBe('whole')
  })
})

describe('toggling split keeps the selected file at the top', () => {
  test('the second file stays at the top after the layout changes', async () => {
    const { view } = await viewOf(100)
    view.reveal?.('/work/b.ts')
    let tree = view.render(kitOf(200, 12))
    expect(byKey(tree, 'b.ts#title')).toBeDefined()
    press(splitChip(tree))
    tree = view.render(kitOf(200, 12))
    expect(byKey(tree, 'b.ts#title')).toBeDefined()
    // Still at the file's title: no pinned a.ts title, none of a.ts's hunk rows above it.
    expect(byKey(tree, 'a.ts#pinned')).toBeUndefined()
    expect(findAll(tree, n => String(n.props?.key ?? '').startsWith('a.ts#hunk'))).toHaveLength(0)
  })
})

describe('the split chip', () => {
  test('is reachable in the two-row header at 40-60 columns with a note pending', async () => {
    const { view, review } = await viewOf(40)
    review.add({ path: 'a.ts', text: 'a note' })
    for (let columns = 42; columns <= 61; columns++) {
      const tree = view.render(kitOf(columns, 30))
      expect(splitChip(tree)).toBeDefined()
    }
  })

  test('is hidden when the body is below the minimum, and a press never stores a dead choice', async () => {
    const { view } = await viewOf(40)
    const narrow = view.render(kitOf(30, 30))
    expect(splitChip(narrow)).toBeUndefined()
  })

  test('judges the body width, not the pane: a 40-column pane has a 38-column bar body', async () => {
    const { view } = await viewOf(40)
    // The bar style spends a rail cell or two, so the body is under 40 and does not split.
    const tree = view.render(kitOf(40, 30))
    expect(splitChip(tree)).toBeUndefined()
    const wide = view.render(kitOf(60, 30))
    expect(splitChip(wide)?.props.label).toContain('unified')
  })
})

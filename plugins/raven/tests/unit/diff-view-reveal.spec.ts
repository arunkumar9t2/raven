import { describe, expect, test } from 'bun:test'
import type { Kit } from '../../hooks/core/view'
import type { Run } from '../../hooks/git/load'
import { createReview } from '../../hooks/review/review'
import { createDiffView, type DiffActions } from '../../hooks/views/diff-view'
import { fakeHost } from './fake-host'

/**
 * `createDiffView`'s render functions compile to bare `h(...)` calls (the mod sandbox's classic
 * JSX runtime, see `types/claude-code.d.ts`); outside that sandbox nothing supplies `h`, so these
 * specs supply a minimal one themselves — a plain-data tree a test can walk — rather than run the
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
  surface: 'terminal',
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
    const view = createDiffView(host, review, NO_ACTIONS)

    await view.refresh()
    // rows=7: fixedRowsOf(2 files, 8) = 5, leaving 2 body rows — exactly a.ts's title+status, so
    // only a stream jump to b.ts (3 rows down) changes which heading is in view.
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
    expect(textUnder(findByKey(tree, 'row:a.ts'))).toContain('❯')
  })

  test("scrolling applies even when a follow's pendingReveal is still latched", async () => {
    const host = fakeHost({ run: runOf() })
    const review = createReview(host, () => 0)
    const view = createDiffView(host, review, NO_ACTIONS)

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
})

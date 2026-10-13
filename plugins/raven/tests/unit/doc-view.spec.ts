import { describe, expect, test } from 'bun:test'
import type { Kit } from '../../hooks/core/view'
import { createReview } from '../../hooks/review/review'
import { styleOf } from '../../hooks/ui/style'
import { TITLE_EDGE_CELLS } from '../../hooks/views/doc-path'
import { fakeHost } from './fake-host'

type Node = { type: unknown; props: Record<string, unknown> }

function h(tag: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Node {
  return { type: tag, props: { ...(props ?? {}), children } }
}
function Fragment(props: Record<string, unknown>): Node {
  return { type: 'Fragment', props }
}
;(globalThis as Record<string, unknown>).h = h
;(globalThis as Record<string, unknown>).Fragment = Fragment

const { createDocView } = await import('../../hooks/views/doc-view')

const PATH = '/repo/x.md'

function flatten(children: unknown): unknown[] {
  if (children == null || children === false || children === true) return []
  if (Array.isArray(children)) return children.flatMap(flatten)
  return [children]
}
function findAll(node: unknown, predicate: (n: Node) => boolean, out: Node[] = []): Node[] {
  for (const n of flatten(node)) {
    const current = n as Node
    if (current === null || typeof current !== 'object') continue
    if (predicate(current)) out.push(current)
    findAll(current.props?.children, predicate, out)
  }
  return out
}
const textUnder = (node: unknown): string =>
  flatten(node)
    .map(n =>
      typeof n === 'string' || typeof n === 'number'
        ? String(n)
        : textUnder((n as Node).props?.children),
    )
    .join('')
const keyed = (tree: unknown, key: string) => findAll(tree, n => n.props.key === key)
const keyStarts = (tree: unknown, prefix: string, type?: string) =>
  findAll(tree, n => String(n.props.key ?? '').startsWith(prefix) && (!type || n.type === type))

function kitOf(columns = 40, style = 'bar', canType = true): Kit {
  const ui = {
    Box: 'Box',
    Text: 'Text',
    Code: 'Code',
    Button: 'Button',
    Input: 'Input',
    Select: 'Select',
    Client: 'Client',
    Markdown: 'Markdown',
    Image: 'Image',
  }
  return {
    ui,
    columns,
    rows: 50,
    capabilities: { canType, canPick: true, canShowImage: true, canClient: false },
    style: styleOf(style as never),
    press: () => {},
  } as unknown as Kit
}

async function setup(files: Record<string, string>) {
  const host = fakeHost({
    readFile: async path => {
      if (path in files) return files[path] as string
      throw new Error(`ENOENT ${path}`)
    },
  })
  const review = createReview(host, () => 1_000_000)
  const focused: string[] = []
  const view = createDocView(host, review, { focus: key => focused.push(key) }, () => 1_000_000)
  await view.show({ kind: 'file', path: PATH })
  return { view, review, focused }
}

const pressNote = (tree: unknown, index: number) => {
  const press = keyStarts(tree, 'comment:', 'Button')[index]?.props.onPress as
    | (() => void)
    | undefined
  if (press === undefined) throw new Error('no note chip')
  press()
}

describe('doc view: composing across a reload', () => {
  const before = '# Alpha\n\na\n\n# Beta\n\nb\n\n# Gamma\n\nc\n'

  test('the compose box follows its heading when a section is inserted above it', async () => {
    const files = { [PATH]: before }
    const { view, review } = await setup(files)
    pressNote(view.render(kitOf()), 1) // Beta
    files[PATH] = '# Alpha\n\na\n\n# Inserted\n\nnew\n\n# Beta\n\nb\n\n# Gamma\n\nc\n'
    await view.reload(PATH)
    const tree = view.render(kitOf())
    const box = keyStarts(tree, 'comment-box:')[0]
    expect(box).toBeDefined()
    // the box sits in Beta's section (index 2), not under the new section at index 1
    const beta = keyed(tree, 'section:2')[0]
    expect(keyed(beta, `input:${PATH}|§2`).length).toBe(1)
    const input = findAll(tree, n => n.type === 'Input')[0] as Node
    ;(input.props.onSubmit as (text: string) => void)('about beta')
    expect(review.comments().map(c => [c.section, c.sectionIndex, c.text])).toEqual([
      ['Beta', 2, 'about beta'],
    ])
  })

  test('the compose box closes when its heading is gone, and a submit stores nothing', async () => {
    const files = { [PATH]: before }
    const { view, review } = await setup(files)
    const stale = view.render(kitOf())
    pressNote(stale, 1)
    const staleInput = findAll(view.render(kitOf()), n => n.type === 'Input')[0] as Node
    files[PATH] = '# Alpha\n\na\n\n# Other\n\nb\n\n# Gamma\n\nc\n'
    await view.reload(PATH)
    const tree = view.render(kitOf())
    expect(keyStarts(tree, 'comment-box:').length).toBe(0)
    ;(staleInput.props.onSubmit as (text: string) => void)('late')
    expect(review.comments()).toEqual([])
  })

  test('equal headings are told apart by occurrence', async () => {
    const files = { [PATH]: '# A\n\nx\n\n# Same\n\n1\n\n# Same\n\n2\n' }
    const { view, review } = await setup(files)
    pressNote(view.render(kitOf()), 2) // second "Same"
    files[PATH] = '# Top\n\nt\n\n# A\n\nx\n\n# Same\n\n1\n\n# Same\n\n2\n'
    await view.reload(PATH)
    const tree = view.render(kitOf())
    expect(keyed(keyed(tree, 'section:3')[0], `input:${PATH}|§3`).length).toBe(1)
    const input = findAll(tree, n => n.type === 'Input')[0] as Node
    ;(input.props.onSubmit as (text: string) => void)('second')
    expect(review.comments().map(c => [c.section, c.sectionIndex])).toEqual([['Same', 3]])
  })
})

describe('doc view: the top section row', () => {
  const prose = 'Intro prose.\n\n# H\n\nx'

  test('no section head when there is nothing to draw in it (cannot type)', async () => {
    const { view } = await setup({ [PATH]: prose })
    const tree = view.render(kitOf(40, 'bar', false))
    expect(keyed(tree, 'section-head:0').length).toBe(0)
    expect(keyed(tree, 'section-head:1').length).toBe(1)
  })

  test('composing on the top keeps the chip row one row tall, so the page does not shift', async () => {
    const { view } = await setup({ [PATH]: prose })
    const idle = view.render(kitOf())
    expect(keyed(idle, 'section-head:0').length).toBe(1)
    pressNote(idle, 0)
    const tree = view.render(kitOf())
    const head = keyed(tree, 'section-head:0')[0] as Node
    const row = findAll(head, n => String(n.props.key ?? '').startsWith('section-note:'))[0] as Node
    expect(row.props.height).toBe(1)
  })
})

describe('doc view: heading rows', () => {
  test('the heading mark never shrinks', async () => {
    const { view } = await setup({ [PATH]: `# ${'Very long heading '.repeat(6)}\n\nbody` })
    const tree = view.render(kitOf(24))
    const mark = findAll(tree, n => n.type === 'Text' && textUnder(n).startsWith('▌'))[0] as Node
    const holder = findAll(tree, n => flatten(n.props.children).includes(mark))[0] as Node
    expect(holder.props.flexShrink).toBe(0)
  })

  test('the rule under an H1 leaves the last column free', async () => {
    const { view } = await setup({ [PATH]: '# Title\n\nbody' })
    const tree = view.render(kitOf(40, 'rounded'))
    const rule = keyed(tree, 'section-rule:0')[0] as Node
    expect(rule.props.paddingRight).toBe(TITLE_EDGE_CELLS)
  })

  test('an empty heading is not drawn as (top)', async () => {
    const { view } = await setup({ [PATH]: 'Intro\n\n# \n\nbody' })
    const tree = view.render(kitOf())
    const texts = findAll(tree, n => n.type === 'Text').map(textUnder)
    expect(texts.filter(t => t === '(top)')).toEqual([])
    // and it is its own section, so the real top keeps its own anchor
    expect(keyed(tree, 'section:1').length).toBe(1)
  })

  test("a section's first body line keeps its indent", async () => {
    const { view } = await setup({ [PATH]: '# A\n    indented code\n' })
    const tree = view.render(kitOf())
    const md = findAll(tree, n => n.type === 'Markdown')[0] as Node
    expect(md.props.text).toBe('    indented code')
  })
})

describe('doc view: an empty file', () => {
  test('shows one dim "Empty file" line under the title', async () => {
    const { view } = await setup({ [PATH]: '' })
    const tree = view.render(kitOf())
    const empties = findAll(tree, n => n.type === 'Text' && textUnder(n) === 'Empty file')
    expect(empties.length).toBe(1)
    expect(empties[0]?.props.dimColor).toBe(true)
  })
})

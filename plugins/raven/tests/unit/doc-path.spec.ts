import { describe, expect, test } from 'bun:test'
import { widthOf } from '../../hooks/ui/wrap'
import { shortenPath, titlePathOf } from '../../hooks/views/doc-path'

describe('shortenPath', () => {
  test('a path that fits is returned unchanged', () => {
    expect(shortenPath('docs/plan.md', 12)).toBe('docs/plan.md')
    expect(shortenPath('docs/plan.md', 40)).toBe('docs/plan.md')
    expect(shortenPath('a.md', 4)).toBe('a.md')
  })

  test('a path too long loses whole leading segments behind a "…/"', () => {
    const path = '/home/me/work/scratchpad/raven-ui-decisions.md'
    expect(shortenPath(path, 36)).toBe('…/scratchpad/raven-ui-decisions.md')
    expect(shortenPath(path, 34)).toBe('…/scratchpad/raven-ui-decisions.md')
    expect(shortenPath(path, 33)).toBe('…/raven-ui-decisions.md')
    expect(shortenPath('docs/superpowers/plans/x.md', 15)).toBe('…/plans/x.md')
  })

  test('the result never exceeds the width', () => {
    const path = '/home/me/work/scratchpad/raven-ui-decisions.md'
    for (let width = 4; width <= widthOf(path); width++) {
      expect(widthOf(shortenPath(path, width))).toBeLessThanOrEqual(width)
    }
  })

  test('a single segment longer than the room keeps its end behind a "…"', () => {
    expect(shortenPath('/a/verylongfilename-without-end.md', 12)).toBe('…hout-end.md')
    expect(shortenPath('docs/plan.md', 4)).toBe('….md')
  })

  test('under 4 cells there is no room to say anything: an empty string', () => {
    expect(shortenPath('docs/plan.md', 3)).toBe('')
    expect(shortenPath('a.md', 0)).toBe('')
    expect(shortenPath('a.md', -5)).toBe('')
  })
})

describe('titlePathOf', () => {
  test('takes what the title, the 2-cell gap and the reserved edge cell leave', () => {
    // 40 columns - 1 edge - 10 title - 2 gap = 27 cells for the path.
    expect(titlePathOf('/work/docs/superpowers/plans/x.md', 40, 10)).toBe(
      '…/superpowers/plans/x.md',
    )
  })

  test('a path that fits shows whole', () => {
    expect(titlePathOf('docs/plan.md', 80, 10)).toBe('docs/plan.md')
  })

  test('no room left drops the path', () => {
    expect(titlePathOf('docs/plan.md', 14, 10)).toBe('')
  })
})

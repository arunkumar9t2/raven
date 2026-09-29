import { describe, expect, test } from 'bun:test'
import type { TurnEdits } from '../../hooks/review/turns'
import {
  sourceOf,
  sourceOptionsOf,
  sourceValueOf,
  turnValueOf,
} from '../../hooks/views/diff/source'

const turnOf = (index: number, prompt: string): TurnEdits => ({
  index,
  prompt,
  files: [{ path: `f${index}.ts`, hunks: [] }],
})

describe('sourceOf / sourceValueOf', () => {
  test('round-trips head, session, and branch-point', () => {
    for (const source of [
      { kind: 'head' },
      { kind: 'session' },
      { kind: 'branch-point' },
    ] as const) {
      expect(sourceOf(sourceValueOf(source))).toEqual(source)
    }
  })

  test('round-trips a turn, keeping its index', () => {
    const source = { kind: 'turn', index: 4 } as const
    expect(sourceOf(sourceValueOf(source))).toEqual(source)
    expect(sourceValueOf(source)).toBe(turnValueOf(4))
  })

  test('an unrecognized value falls back to head', () => {
    expect(sourceOf('nonsense')).toEqual({ kind: 'head' })
    expect(sourceOf('turn:not-a-number')).toEqual({ kind: 'head' })
  })
})

describe('sourceOptionsOf', () => {
  test('HEAD and session start always appear, branch point only when resolvable', () => {
    const withoutBranchPoint = sourceOptionsOf({ hasBranchPoint: false, turns: [] })
    expect(withoutBranchPoint.map(option => option.value)).toEqual(['head', 'session'])

    const withBranchPoint = sourceOptionsOf({ hasBranchPoint: true, turns: [] })
    expect(withBranchPoint.map(option => option.value)).toEqual(['head', 'session', 'branch-point'])
  })

  test('turns are listed newest first, labelled with their prompt', () => {
    const turns = [turnOf(1, 'first turn'), turnOf(2, 'second turn')]
    const options = sourceOptionsOf({ hasBranchPoint: false, turns })

    expect(options.slice(2)).toEqual([
      { value: turnValueOf(2), label: 'turn 2 — second turn' },
      { value: turnValueOf(1), label: 'turn 1 — first turn' },
    ])
  })
})

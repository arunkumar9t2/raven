import { describe, expect, test } from 'bun:test'
import type { Hunk } from '../../hooks/git/hunks'
import type { TurnEdits } from '../../hooks/review/turns'
import {
  selectedHunksOf,
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

describe('selectedHunksOf', () => {
  const TURN_HUNK: Hunk = { header: '@@ -1,1 +1,1 @@', text: '@@ -1,1 +1,1 @@\n-a\n+b\n' }
  const MODEL_HUNK: Hunk = { header: '@@ -2,1 +2,1 @@', text: '@@ -2,1 +2,1 @@\n-x\n+y\n' }

  test('a turn source with no hunks stays undefined, never falling back to model.hunks', () => {
    expect(selectedHunksOf({ kind: 'turn', index: 1 }, undefined, [MODEL_HUNK])).toBeUndefined()
  })

  test("a turn source with hunks uses the turn's own, ignoring model.hunks", () => {
    expect(selectedHunksOf({ kind: 'turn', index: 1 }, [TURN_HUNK], [MODEL_HUNK])).toEqual([
      TURN_HUNK,
    ])
  })

  test('a non-turn source always uses model.hunks', () => {
    expect(selectedHunksOf({ kind: 'head' }, undefined, [MODEL_HUNK])).toEqual([MODEL_HUNK])
    expect(selectedHunksOf({ kind: 'head' }, undefined, undefined)).toBeUndefined()
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
      { value: turnValueOf(2), label: 'turn 2: second turn' },
      { value: turnValueOf(1), label: 'turn 1: first turn' },
    ])
  })
})

import { describe, expect, test } from 'bun:test'
import { fixedRowsOf } from '../../hooks/views/diff/blocks'

describe('fixedRowsOf', () => {
  test('the 2-row header plus the file list plus the rule, file list under the cap', () => {
    expect(fixedRowsOf(3, 8)).toBe(2 + 3 + 1)
  })

  test('the file list clamps at the cap', () => {
    expect(fixedRowsOf(20, 8)).toBe(2 + 8 + 1)
  })

  test('no files still reserves the header and rule rows', () => {
    expect(fixedRowsOf(0, 8)).toBe(2 + 0 + 1)
  })
})

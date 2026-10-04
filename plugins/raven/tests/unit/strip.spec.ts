import { describe, expect, test } from 'bun:test'
import { createPresses } from '../../hooks/core/presses'
import { cellsOf, pillAt, type StripRow } from '../../hooks/surface/strip'
import { pill } from '../../hooks/ui/strip'
import { widthOf } from '../../hooks/ui/wrap'

describe('cellsOf', () => {
  test('counts wide characters and emoji as two cells, combining marks as none', () => {
    expect(cellsOf('abc')).toBe(3)
    expect(cellsOf('日本')).toBe(4)
    expect(cellsOf('🚀 go')).toBe(5)
    expect(cellsOf('é')).toBe(1)
  })

  test('agrees with the plugin-side measure it was copied from', () => {
    for (const text of ['plain', '✓ stage', '日本語', '🚀✅ ok', 'éx', '↺ sure?', '']) {
      expect(cellsOf(text)).toBe(widthOf(text))
    }
  })
})

describe('pillAt', () => {
  const row: StripRow = {
    left: [{ t: 'L1–2 ' }, { t: ' a ', id: 'a' }, { t: '日', id: 'wide' }],
    right: [{ t: ' b ', id: 'b' }, { t: ' ' }, { t: ' c ', id: 'c' }],
  }

  test('finds a left pill by the cells the segments before it take, wide characters as two', () => {
    expect(pillAt(row, 4, 40)).toBe('')
    expect(pillAt(row, 5, 40)).toBe('a')
    expect(pillAt(row, 7, 40)).toBe('a')
    expect(pillAt(row, 8, 40)).toBe('wide')
    expect(pillAt(row, 9, 40)).toBe('wide')
    expect(pillAt(row, 10, 40)).toBe('')
  })

  test('right segments end at the region edge', () => {
    // widths 3 + 1 + 3 = 7, so b spans 33..35, the spacer 36, c 37..39 of 40
    expect(pillAt(row, 32, 40)).toBe('')
    expect(pillAt(row, 33, 40)).toBe('b')
    expect(pillAt(row, 36, 40)).toBe('')
    expect(pillAt(row, 37, 40)).toBe('c')
    expect(pillAt(row, 39, 40)).toBe('c')
    expect(pillAt(row, 40, 40)).toBe('')
  })

  test('a region too narrow for the right side starts it at column 0', () => {
    expect(pillAt({ left: [], right: [{ t: ' wide pill ', id: 'p' }] }, 0, 4)).toBe('p')
  })
})

describe('pill', () => {
  test('pads its label by one cell each side and carries its kind colours and handler', () => {
    const seg = pill('stage:x', '✓', 'stage', 'normal', () => {})
    expect(seg.t).toBe(' ✓ stage ')
    expect(seg.id).toBe('stage:x')
    expect(seg.bg).toBe('userMessageBackground')
    expect(seg.hoverBg).toBe('selectionBg')
    expect(typeof seg.onPress).toBe('function')
  })

  test('an icon-only pill has no doubled gap', () => {
    expect(pill('i', '✓', '', 'normal', () => {}).t).toBe(' ✓ ')
  })

  test('an armed pill is a filled error pill', () => {
    const seg = pill('r', '↺', 'sure?', 'armed', () => {})
    expect(seg.bg).toBe('error')
    expect(seg.c).toBe('inverseText')
  })
})

describe('the press registry', () => {
  test('dispatch runs the handler registered under the scope and id', () => {
    const presses = createPresses()
    const ran: string[] = []
    presses.begin('diff')
    presses.add('diff', 'a', () => ran.push('a'))
    expect(presses.dispatch('diff', 'a')).toBe(true)
    expect(ran).toEqual(['a'])
  })

  test('an unknown id or scope dispatches nothing', () => {
    const presses = createPresses()
    presses.add('diff', 'a', () => {})
    expect(presses.dispatch('diff', 'b')).toBe(false)
    expect(presses.dispatch('doc', 'a')).toBe(false)
  })

  test('begin clears the scope, so an id the next render does not draw dies', () => {
    const presses = createPresses()
    presses.add('diff', 'a', () => {})
    presses.begin('diff')
    presses.add('diff', 'b', () => {})
    expect(presses.dispatch('diff', 'a')).toBe(false)
    expect(presses.dispatch('diff', 'b')).toBe(true)
  })

  test('scopes are independent', () => {
    const presses = createPresses()
    presses.add('diff', 'a', () => {})
    presses.add('doc', 'a', () => {})
    presses.begin('doc')
    expect(presses.dispatch('diff', 'a')).toBe(true)
    expect(presses.dispatch('doc', 'a')).toBe(false)
  })
})

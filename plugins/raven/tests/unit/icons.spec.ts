import { describe, expect, test } from 'bun:test'
import { COLORS } from '../../hooks/core/colors'
import { iconOf, statusMarkOf } from '../../hooks/views/icons'

describe('iconOf', () => {
  test('matches by extension', () => {
    expect(iconOf('src/App.tsx').color).toBe('rainbow_blue')
    expect(iconOf('build.gradle.kts').color).toBe('rainbow_violet')
    expect(iconOf('main.py').color).toBe('rainbow_green')
  })

  test('matches lock files by suffix, not just extension', () => {
    expect(iconOf('bun.lockb').glyph).toBe(iconOf('package-lock.json').glyph)
  })

  test('matches well-known filenames without extension', () => {
    expect(iconOf('Dockerfile').color).toBe('rainbow_blue')
    expect(iconOf('Makefile').color).not.toBe('subtle')
    expect(iconOf('.gitignore').color).toBe('rainbow_red')
    expect(iconOf('LICENSE').color).toBe('rainbow_yellow')
    expect(iconOf('README').glyph).toBe(iconOf('README.md').glyph)
  })

  test('image extensions share one glyph', () => {
    const png = iconOf('logo.png')
    expect(iconOf('logo.svg')).toEqual(png)
    expect(iconOf('logo.jpg')).toEqual(png)
  })

  test('every icon is coloured by a theme key, never a raw colour', () => {
    const paths = [
      'a.ts',
      'a.js',
      'a.md',
      'a.json',
      'a.css',
      'a.py',
      'a.rs',
      'a.go',
      'a.sh',
      'a.lock',
      'a.png',
      'Dockerfile',
      'x.unknown',
    ]
    for (const path of paths) expect(iconOf(path).color).toMatch(/^(rainbow_[a-z]+|subtle)$/)
    expect(iconOf('a.ts').color).toBe('rainbow_blue')
    expect(iconOf('a.js').color).toBe('rainbow_yellow')
    expect(iconOf('a.md').color).toBe('rainbow_indigo')
    expect(iconOf('a.css').color).toBe('rainbow_violet')
    expect(iconOf('a.rs').color).toBe('rainbow_orange')
    expect(iconOf('a.lock').color).toBe('subtle')
  })

  test('falls back to a generic glyph for unknown extensions', () => {
    expect(iconOf('notes.xyz')).toEqual({ glyph: '\u{f0214}', color: 'subtle' })
  })

  test('is path-aware, not just basename-blind', () => {
    expect(iconOf('a/b/c/index.ts').color).toBe(iconOf('index.ts').color)
  })
})

describe('statusMarkOf', () => {
  test('uses plain letters, not glyphs', () => {
    expect(statusMarkOf('added')).toEqual({ glyph: 'A', color: COLORS.added })
    expect(statusMarkOf('modified').glyph).toBe('M')
    expect(statusMarkOf('deleted').glyph).toBe('D')
    expect(statusMarkOf('renamed').glyph).toBe('R')
    expect(statusMarkOf('untracked').glyph).toBe('U')
  })

  test('colours by theme key, not a raw colour', () => {
    expect(statusMarkOf('added').color).toBe(COLORS.added)
    expect(statusMarkOf('modified').color).toBe(COLORS.modified)
    expect(statusMarkOf('deleted').color).toBe(COLORS.removed)
    expect(statusMarkOf('renamed').color).toBe(COLORS.suggestion)
  })

  test('added and untracked are both the same colour', () => {
    expect(statusMarkOf('added').color).toBe(statusMarkOf('untracked').color)
  })
})

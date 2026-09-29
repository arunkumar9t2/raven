import { describe, expect, test } from 'bun:test'
import { iconOf, statusMarkOf } from '../../hooks/views/icons'

describe('iconOf', () => {
  test('matches by extension', () => {
    expect(iconOf('src/App.tsx').color).toBe('#3178c6')
    expect(iconOf('build.gradle.kts').color).toBe('#7f52ff')
    expect(iconOf('main.py').color).toBe('#3572a5')
  })

  test('matches lock files by suffix, not just extension', () => {
    expect(iconOf('bun.lockb').glyph).toBe(iconOf('package-lock.json').glyph)
  })

  test('matches well-known filenames without extension', () => {
    expect(iconOf('Dockerfile').color).toBe('#458ee6')
    expect(iconOf('Makefile').color).not.toBe('#6d8086')
    expect(iconOf('.gitignore').color).toBe('#f14e32')
    expect(iconOf('LICENSE').color).toBe('#cbcb41')
    expect(iconOf('README').glyph).toBe(iconOf('README.md').glyph)
  })

  test('image extensions share one glyph', () => {
    const png = iconOf('logo.png')
    expect(iconOf('logo.svg')).toEqual(png)
    expect(iconOf('logo.jpg')).toEqual(png)
  })

  test('falls back to a generic glyph for unknown extensions', () => {
    expect(iconOf('notes.xyz')).toEqual({ glyph: '\u{f0214}', color: '#6d8086' })
  })

  test('is path-aware, not just basename-blind', () => {
    expect(iconOf('a/b/c/index.ts').color).toBe(iconOf('index.ts').color)
  })
})

describe('statusMarkOf', () => {
  test('uses plain letters, not glyphs', () => {
    expect(statusMarkOf('added')).toEqual({ glyph: 'A', color: '#3fb950' })
    expect(statusMarkOf('modified').glyph).toBe('M')
    expect(statusMarkOf('deleted').glyph).toBe('D')
    expect(statusMarkOf('renamed').glyph).toBe('R')
    expect(statusMarkOf('untracked').glyph).toBe('U')
  })

  test('added and untracked are both green', () => {
    expect(statusMarkOf('added').color).toBe(statusMarkOf('untracked').color)
  })
})

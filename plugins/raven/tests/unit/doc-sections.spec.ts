import { describe, expect, test } from 'bun:test'
import { docSectionsOf, TOP_SECTION } from '../../hooks/views/doc-sections'

describe('docSectionsOf', () => {
  test('cuts at ATX headings, each section keeping its heading line', () => {
    expect(docSectionsOf('# Plan\n\nIntro\n\n## Goals\n\n- a\n')).toEqual([
      { heading: 'Plan', level: 1, text: '# Plan\n\nIntro' },
      { heading: 'Goals', level: 2, text: '## Goals\n\n- a' },
    ])
  })

  test('text before the first heading is the top section', () => {
    expect(docSectionsOf('Preface\n\n# One\nbody')).toEqual([
      { heading: TOP_SECTION, level: 0, text: 'Preface' },
      { heading: 'One', level: 1, text: '# One\nbody' },
    ])
  })

  test('a doc with no headings is one top section', () => {
    expect(docSectionsOf('just text')).toEqual([
      { heading: TOP_SECTION, level: 0, text: 'just text' },
    ])
  })

  test('a heading-like line inside a fence is not a boundary', () => {
    const doc = '# Run\n\n```sh\n# not a heading\nls\n```\n'
    expect(docSectionsOf(doc)).toEqual([
      { heading: 'Run', level: 1, text: '# Run\n\n```sh\n# not a heading\nls\n```' },
    ])
  })

  test('closing hashes and trailing spaces are not part of the heading', () => {
    expect(docSectionsOf('## Goals ##  \nx')[0]?.heading).toBe('Goals')
  })

  test('the level is the number of leading hashes, up to six', () => {
    const levels = docSectionsOf('# a\n## b\n### c\n#### d\n##### e\n###### f\n').map(s => s.level)
    expect(levels).toEqual([1, 2, 3, 4, 5, 6])
  })

  test('an empty heading is its own section with an empty title, not the top', () => {
    const sections = docSectionsOf('Intro\n\n# \n\nbody')
    expect(sections.map(s => s.heading)).toEqual([TOP_SECTION, ''])
    expect(sections[1]?.level).toBe(1)
  })

  test('a first line keeps its indent (an indented code block)', () => {
    expect(docSectionsOf('\n    code\n')[0]?.text).toBe('    code')
  })
})

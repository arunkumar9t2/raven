import { describe, expect, test } from 'bun:test'
import { docSectionsOf, TOP_SECTION } from '../../hooks/views/doc-sections'

describe('docSectionsOf', () => {
  test('cuts at ATX headings, each section keeping its heading line', () => {
    expect(docSectionsOf('# Plan\n\nIntro\n\n## Goals\n\n- a\n')).toEqual([
      { heading: 'Plan', text: '# Plan\n\nIntro' },
      { heading: 'Goals', text: '## Goals\n\n- a' },
    ])
  })

  test('text before the first heading is the top section', () => {
    expect(docSectionsOf('Preface\n\n# One\nbody')).toEqual([
      { heading: TOP_SECTION, text: 'Preface' },
      { heading: 'One', text: '# One\nbody' },
    ])
  })

  test('a doc with no headings is one top section', () => {
    expect(docSectionsOf('just text')).toEqual([{ heading: TOP_SECTION, text: 'just text' }])
  })

  test('a heading-like line inside a fence is not a boundary', () => {
    const doc = '# Run\n\n```sh\n# not a heading\nls\n```\n'
    expect(docSectionsOf(doc)).toEqual([
      { heading: 'Run', text: '# Run\n\n```sh\n# not a heading\nls\n```' },
    ])
  })

  test('closing hashes and trailing spaces are not part of the heading', () => {
    expect(docSectionsOf('## Goals ##  \nx')[0]?.heading).toBe('Goals')
  })
})

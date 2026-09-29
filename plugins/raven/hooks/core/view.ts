import type { Elements, RenderElement } from 'claude-code'

/** The elements a view draws with; Raven draws on the terminal surface. */
export type Ui = Pick<
  Elements['terminal'],
  'Box' | 'Text' | 'Button' | 'Input' | 'Select' | 'Code' | 'Markdown'
>

/** The engine refuses a `Markdown`, `Code` or `Text` element whose text is longer than this. */
export const ELEMENT_TEXT_LIMIT = 10_000

/** What a view's render is handed: the elements, the pane body's width and rows in cells. */
export type Kit = { ui: Ui; columns: number; rows: number }

/**
 * One engine pane Raven draws. The engine shows one pane at a time and tabs the rest, so each
 * view is a tab.
 */
export type View = {
  readonly pane: { readonly id: string; readonly title: string }
  /** The `/raven <subcommand>` that toggles it. */
  readonly subcommand: string
  render: (kit: Kit) => RenderElement
  /** Moves the view's own scroll by `by` rows (negative up); true when it handled the move. */
  scroll?: (by: number) => boolean
}

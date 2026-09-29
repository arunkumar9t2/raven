import type { Elements, RenderElement } from 'claude-code'

/**
 * The elements a view draws with; Raven draws on the terminal surface. `Image` is optional: a
 * view checks `kit.ui.Image === undefined` and falls back to text before drawing one.
 */
export type Ui = Pick<
  Elements['terminal'],
  'Box' | 'Text' | 'Button' | 'Input' | 'Select' | 'Code' | 'Markdown'
> &
  Partial<Pick<Elements['terminal'], 'Image'>>

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
  /** Rereads the world; the controller runs it before the first drawing of a fresh module. */
  refresh?: () => Promise<void>
  render: (kit: Kit) => RenderElement
  /** Moves the view's own scroll by `by` rows (negative up); true when it handled the move. */
  scroll?: (by: number) => boolean
}

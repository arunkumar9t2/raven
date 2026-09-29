import type { Elements, RenderElement } from 'claude-code'

/** The elements a view draws with; Raven draws on the terminal surface. */
export type Ui = Pick<
  Elements['terminal'],
  'Box' | 'Text' | 'Button' | 'Input' | 'Select' | 'Code' | 'Markdown'
>

/** What a view's render is handed: the elements and the pane body's width in cells. */
export type Kit = { ui: Ui; columns: number }

/**
 * One engine pane Raven draws. The engine shows one pane at a time and tabs the rest, so each
 * view is a tab.
 */
export type View = {
  readonly pane: { readonly id: string; readonly title: string }
  /** The `/raven <subcommand>` that toggles it. */
  readonly subcommand: string
  render: (kit: Kit) => RenderElement
}

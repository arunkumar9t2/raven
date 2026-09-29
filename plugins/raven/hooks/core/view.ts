import type { Elements, RenderElement } from 'claude-code'

/**
 * The elements a view draws with; Raven draws on the terminal surface, mobile among them. `Image`,
 * `Input` and `Select` are optional: a view checks each for `undefined` and degrades — no typed
 * text, no picker — rather than assume every surface has them.
 */
export type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Code' | 'Markdown'> &
  Partial<Pick<Elements['terminal'], 'Image' | 'Input' | 'Select'>>

/** What a surface's element table lets a view draw: typed text, a picker. */
export type Capabilities = { canType: boolean; canPick: boolean }

/** Reads a `Ui`'s capabilities off which optional elements its table actually carries. */
export function capabilitiesOf(ui: Ui): Capabilities {
  return { canType: ui.Input !== undefined, canPick: ui.Select !== undefined }
}

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

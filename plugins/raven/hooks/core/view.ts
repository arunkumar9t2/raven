import type { Elements, RenderElement, RenderSurface } from 'claude-code'

/**
 * The elements a view draws with; Raven draws on the terminal surface, mobile among them. `Image`,
 * `Input` and `Select` are optional on the type so a view still compiles if it checks for
 * `undefined`, but the engine completes every surface's table to a constructor, even one it
 * doesn't carry (it just draws a fragment) — so `capabilitiesOf` reads the surface name instead,
 * never `ui.Input`/`ui.Select` presence, to tell a real control from a completed fragment.
 */
export type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Button' | 'Code' | 'Markdown'> &
  Partial<Pick<Elements['terminal'], 'Image' | 'Input' | 'Select'>>

/** What a surface's element table lets a view draw: typed text, a picker. */
export type Capabilities = { canType: boolean; canPick: boolean }

/** Every surface but `mobile` carries a real `Input` and `Select`; mobile carries neither. */
export function capabilitiesOf(surface: RenderSurface): Capabilities {
  const has = surface !== 'mobile'
  return { canType: has, canPick: has }
}

/** Every surface has `Input` and `Select`, so a caller can skip `capabilities`. */
export const FULL_CAPABILITIES: Capabilities = { canType: true, canPick: true }

/** The engine refuses a `Markdown`, `Code` or `Text` element whose text is longer than this. */
export const ELEMENT_TEXT_LIMIT = 10_000

/** What a view's render is handed: the elements, the pane body's width and rows in cells, the surface it draws for. */
export type Kit = { ui: Ui; columns: number; rows: number; surface: RenderSurface }

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

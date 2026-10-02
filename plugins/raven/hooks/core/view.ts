import type { Elements, RenderElement, RenderSurface } from 'claude-code'

/**
 * The elements a view draws with; Raven draws on the terminal surface, mobile among them. The
 * engine always completes every surface's table to a constructor for every element name, even one
 * that surface doesn't carry (it just draws a fragment there) — so `Image`, `Input` and `Select`
 * are typed as present here too, never `| undefined`: presence can never tell a real control from
 * a completed fragment. A view never checks for one; it reads `kit.capabilities` instead, which
 * `capabilitiesOf` derives from the surface name, the one source of truth for what each surface
 * actually carries.
 */
export type Ui = Pick<
  Elements['terminal'],
  'Box' | 'Text' | 'Button' | 'Code' | 'Markdown' | 'Image' | 'Input' | 'Select'
>

/** What a surface's element table lets a view draw: typed text, a picker, an inline image. */
export type Capabilities = { canType: boolean; canPick: boolean; canShowImage: boolean }

/**
 * The fixed, per-surface element table (`Elements` in `claude-code`): every surface carries
 * `Input` and `Select` but `mobile`; only `terminal` carries `Image`.
 */
const CAPABILITIES_BY_SURFACE: Record<RenderSurface, Capabilities> = {
  terminal: { canType: true, canPick: true, canShowImage: true },
  desktop: { canType: true, canPick: true, canShowImage: false },
  vscode: { canType: true, canPick: true, canShowImage: false },
  mobile: { canType: false, canPick: false, canShowImage: false },
}

/** A surface's capabilities, read off the fixed table above — never off element presence. */
export function capabilitiesOf(surface: RenderSurface): Capabilities {
  return CAPABILITIES_BY_SURFACE[surface]
}

/** `terminal`'s row, every capability on, so a caller outside a real render can skip the surface. */
export const FULL_CAPABILITIES: Capabilities = CAPABILITIES_BY_SURFACE.terminal

/** The engine refuses a `Markdown`, `Code` or `Text` element whose text is longer than this. */
export const ELEMENT_TEXT_LIMIT = 10_000

/**
 * What a view's render is handed: the elements, the pane body's width and rows in cells, and the
 * capabilities its surface carries — computed once in `register.ts`'s `kitOf`, so a view never
 * calls `capabilitiesOf` or checks an element's presence itself.
 */
export type Kit = { ui: Ui; columns: number; rows: number; capabilities: Capabilities }

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

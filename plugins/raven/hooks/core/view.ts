import type { Elements, RenderElement, RenderSurface } from 'claude-code'
import type { PaneSubcommand } from '../names'

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
  'Box' | 'Text' | 'Button' | 'Code' | 'Markdown' | 'Image' | 'Input' | 'Select' | 'Client'
>

/** What a surface's element table lets a view draw: typed text, a picker, an inline image. */
export type Capabilities = {
  canType: boolean
  canPick: boolean
  canShowImage: boolean
  /** Whether the surface draws a `Client` (a surface module with pointer hover); see `ui/strip.tsx`. */
  canClient: boolean
}

/**
 * The fixed, per-surface element table (`Elements` in `claude-code`): every surface carries
 * `Input` and `Select` but `mobile`; only `terminal` carries `Image`.
 */
const CAPABILITIES_BY_SURFACE: Record<RenderSurface, Capabilities> = {
  terminal: { canType: true, canPick: true, canShowImage: true, canClient: true },
  desktop: { canType: true, canPick: true, canShowImage: false, canClient: true },
  vscode: { canType: true, canPick: true, canShowImage: false, canClient: false },
  mobile: { canType: false, canPick: false, canShowImage: false, canClient: false },
}

/** A surface not among the table's known rows draws no typed, picking or imaging controls. */
const NO_CAPABILITIES: Capabilities = {
  canType: false,
  canPick: false,
  canShowImage: false,
  canClient: false,
}

/**
 * A surface's capabilities, read off the fixed table above — never off element presence. An
 * unknown future surface (one the table hasn't been taught yet) degrades to `NO_CAPABILITIES`
 * rather than throwing, so a view still renders, just without controls the surface may not
 * actually support.
 */
export function capabilitiesOf(surface: RenderSurface, keyboardControls = false): Capabilities {
  const capabilities = CAPABILITIES_BY_SURFACE[surface] ?? NO_CAPABILITIES
  // R42: with `keyboardControls` every surface draws the plain-Button fallback, which is in the Tab ring.
  return keyboardControls ? { ...capabilities, canClient: false } : capabilities
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
export type Kit = {
  ui: Ui
  columns: number
  rows: number
  capabilities: Capabilities
  /**
   * Registers the handler a pill's `{ press: id }` post runs, for the pane this render draws; the
   * controller clears the pane's registrations before each of its renders (`core/presses.ts`).
   */
  press: (id: string, onPress: () => void) => void
}

/**
 * What a kit function that draws off `kit.ui` alone needs — the `hooks/ui/` kit's own
 * components take this rather than the full `Kit`, so a caller holding only `{ ui, columns }`
 * (the `AbovePrompt` band) can still reach them without a cast.
 */
export type UiKit = Pick<Kit, 'ui'>

/**
 * One engine pane Raven draws. The engine shows one pane at a time and tabs the rest, so each
 * view is a tab.
 */
export type View = {
  readonly pane: { readonly id: string; readonly title: string }
  /** The `/raven <subcommand>` that toggles it; one of `PANE_SUBCOMMANDS`, so the CLI, the tool
   * and the views share one list. */
  readonly subcommand: PaneSubcommand
  /** Rereads the world; the controller runs it before the first drawing of a fresh module. */
  refresh?: () => Promise<void>
  render: (kit: Kit) => RenderElement
  /** Moves the view's own scroll by `by` rows (negative up); true when it handled the move. */
  scroll?: (by: number) => boolean
}

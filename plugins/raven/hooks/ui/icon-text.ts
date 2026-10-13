/**
 * The one place an icon meets its text. On some terminals a Nerd Font glyph is drawn wider than the
 * single cell `widthOf` counts, and the following space is painted over (`<glyph>note`). Every site that
 * pairs an icon with a label (pills, card titles, doc heading, band, header counts, list rows) goes
 * through `iconText` / `ICON_GAP`, so the fix is one edit.
 *
 * `ICON_GAP`'s final value is set by the on-screen icon-width probe (Phase 0.1 of the UI-pass spec):
 * it stays one space until the probe shows the glyph spilling, and then becomes two. Widths are
 * always measured off the built string, so nothing else changes when it does.
 */
export const ICON_GAP = ' '

/** `glyph` and `text` joined by `ICON_GAP`; either side may be empty (`'✕'`, `'resend'`). */
export function iconText(glyph: string, text: string): string {
  if (glyph === '') return text
  if (text === '') return glyph
  return `${glyph}${ICON_GAP}${text}`
}

/** The note/comment marker: Nerd Font nf-md-message_text_outline (U+F036A). Every note chip, count and title draws it. */
export const NOTE_GLYPH = '\u{f036a}'

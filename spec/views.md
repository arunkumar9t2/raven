# Views

Raven's pane is a host for **views**: each owns one engine pane (`id`, `title`), a `/raven
<subcommand>` that toggles it, and a `render(kit)` that draws from its own model. The engine shows
one pane at a time and tabs the rest, so `/raven <subcommand>` brings a background tab forward and
hides a shown one; `/raven` alone means `/raven diff`. The four views (Diff, Doc, Files, Tasks)
share this contract, declared as `View` in `plugins/raven/hooks/core/view.ts`; the diff pane and its
review tools are [`diff-pane.md`](./diff-pane.md)'s concern, this spec covers the other three plus the
chrome around all of them: the drawing kit, the status band, the command row, pane tabs and `/raven`
subcommands.

**Triggers** map a finished tool call to a list of view actions (`refresh-diff`, `main-loop-edit`,
`show-doc`, `reload-doc`, `directive`, `tasks`) in one registry
(`plugins/raven/hooks/core/triggers.ts`), so adding a view or a new reaction to a tool call is one
entry there, not a change to `register`. `plugins/raven/hooks/core/raven.ts` is the controller that
turns those actions into calls on the views.

## Doc view

The Doc view (`plugins/raven/hooks/views/doc-view.tsx`, pane id `raven-doc`, subcommand `doc`)
renders one document at a time: a markdown file, an image, any other file highlighted by its path
extension, or inline markdown from a `note` directive (see [`agentic.md`](./agentic.md)). It keeps a
history of up to 10 shown documents, deduplicated by a key over the document's kind and path or title,
most recent first; picking an older entry re-shows it without re-reading it from disk.

The pane draws one title row above the body (`titleRow` in `doc-view.tsx`): the file-type icon (a
document icon for a note), a gap (`ICON_GAP`), and the bold name, which is a shown file's caller-given
title, else its file name, or a note's title. A file also carries its path, dimmed, right-aligned and
shortened from the left to what the name leaves (`shortenPath` in `views/doc-path.ts`: whole leading
segments go behind `…/`, as in `…/scratchpad/raven-ui-decisions.md`; when even the last segment does
not fit its end follows a bare `…`; under four cells the path is dropped). The path is relative to
the session's directory when it lies inside it, else as given. The row keeps the pane's last column
free. With more than one document in the history, the history picker draws above the title.

A markdown
file or note is split by `markdown-chunks.ts` into pieces small enough for the engine's `Markdown`
element, which refuses to draw text over its character cap (`ELEMENT_TEXT_LIMIT`, the same cap `Code`
and `Text` carry, see [`mod-api.md`](./mod-api.md)). Cuts prefer a blank line outside a code fence, so
a code block never splits mid-block; a single block longer than the cap is still cut between lines,
with the fence closed before the cut and reopened after it. Each chunk's fenced code blocks render
through a `Code` element carrying the fence's language, interleaved with `Markdown` elements for the
surrounding prose, so code reads as code rather than as part of the markdown text; an empty fence
draws nothing. GFM tables in prose (outside fences) are split out too and drawn by Raven itself
(`hooks/ui/table.tsx`, layout in `hooks/ui/table-layout.ts`), because the engine's `Markdown` sizes a
table to the terminal, not the pane, so a wide table breaks its borders in a narrower pane. A table
draws at the pane's width (`kit.columns`, less one cell) in the form the card style gives it (see [the
drawing kit](#the-drawing-kit)): under `bar` and `none` a bold header over one `─` rule with the
columns two spaces apart, under `sharp` and `rounded` a full boxed grid with a centred bold header,
its outer corners rounded under `rounded`. Body cells align per the delimiter row; `**bold**` and `` `code` `` cells keep their style through wrapping and
other inline markers draw as their visible text. When the natural widths do not fit, columns shrink
(never below their longest word, 6 to 20 cells) and cell text wraps at word boundaries, hard-breaking a
word wider than its column; when even that does not fit, each row draws as a group of `Header: value`
lines. A table's layout is cached per block, keyed on the width and the style's table form, so a
resize or a `cardStyle` change lays it out again. This holds for files, notes, plans and commentable sections alike (R36). A file that is not markdown renders as one `Code` element instead, truncated at the
same cap with a "the rest of the file is not shown" note when it overruns.

Nothing frames the body: no outer border, no rail. The pane's whole width is the body's, and
Markdown, Raven-drawn tables and notes lay out at it. A note's or a non-markdown file's body sits one
blank row under the title. An empty pane draws a dim Nerd Font icon and a line ("Nothing shown yet.
Plans and docs Claude writes open here"); the other panes' empty states (no tasks, no changes, not a
git repository) share that shape (`ui/empty.tsx`). A markdown file with no content draws a dim "Empty
file" line.

A markdown file (never a note or any other file kind) is also where [review comments](./review.md)
attach, section by section (`docSectionsOf` in `views/doc-sections.ts`, cut at ATX headings outside
code fences; text above the first heading is the `(top)` section). Each section draws, top to bottom:

- **A blank row, the heading, a blank row.** The heading row is the section's heading text and its
  note chip; the Markdown omits the section's own heading line, so the heading is drawn once. The
  look follows the heading's level and the card style (`headingLookOf` in `views/doc-heading.ts`): H1
  and H2 draw the style's mark (`▌ ` in the accent under `bar`) and bold accent text, with a dim `─`
  rule row under them in every style but `bar`; H3 and deeper draw bold text in the default colour
  only, in every style. The rule stands in for a frame under `sharp` and `rounded`, because the
  engine wraps the Markdown and a closed frame would need its height. The first heading follows
  the title with one blank row, the same as any other.
- **The note chip, inline.** On a surface with `canType`, and only while the section is not already
  being composed, a ` <note glyph> note ` pill draws two columns after the heading text (never at the pane's
  right edge, which stays free); it shrinks to its bare icon before it would leave the heading under
  12 cells. The `(top)` section has no heading to show, so its row is the chip alone, and with nothing
  to type it draws no row at all (while it is being composed the row stays, so the page does not jump).
- **The blocks**, one blank row between each (prose, a code fence, a table are separate elements, so
  Raven spaces them). Within one prose element the engine's `Markdown` already keeps a blank row
  between paragraphs, lists and quotes, so prose is not split per paragraph.
- **The section's notes** (the same `┃` note a diff hunk uses, with the addressed ones collapsed into
  a single dim "✓ N addressed" row, one shared split, `splitAddressed` in
  `plugins/raven/hooks/review/comments.ts`) and, while composing, the compose box (no line picker; see
  [review](./review.md#status) for its rows), one blank row below the blocks when there are any.

The trailing group of comments whose section is gone opens with a dim `Outdated` row. Only a comment carrying a `section` draws here (the same discriminator the diff stream's own orphan group uses to leave doc comments out of
itself), so a diff comment (file- or hunk-level) on this same path, shown here only because the
file happens to also be open in this pane, stays out: it belongs to the diff pane's own stream and
draws only there. Controls are keyed by the section's index rather than its heading text, so two
sections sharing a heading never share controls or get their notes crossed; the anchor a comment
carries, and how its "Outdated" group works once a section is gone, is
[`review.md`](./review.md#anchors-and-composing)'s concern, that group collapses its own addressed
comments the same way, grouped by the section identity (heading and index) each one still carries
even though neither names a section on screen any more.

When a shown file is reloaded in place (an edit to an open plan) while a compose box is open, the box
follows its section to wherever it sits after the edit, found by heading and which of the equal headings it
was (`reconcileComposing`): the anchor moves to the section's new index and the Input is focused
again, so what the person typed is kept; the box closes if the section is gone.
Nothing here draws a note control at all for a `note` directive's inline markdown, for a file that
isn't markdown, or for an image, each keeps the plain, uncommentable rendering it always had.

An image renders as an `Image` element sized to fit the pane's width, but only for `.png` (the one
format the surface reads straight from a file) and only on a surface with `canShowImage`; other
image extensions (`.jpg`, `.gif`, `.webp`) and a surface without `canShowImage` both fall back to
the image's path as dim text. [`settings-and-surfaces.md`](./settings-and-surfaces.md) owns which
surfaces carry which capability, and why presence of the element itself is never checked.

A relative or `file:` link inside a shown markdown file resolves against that file's own directory
(`plugins/raven/hooks/views/doc-links.ts`) and opens the target in the Doc view on press; an
`http(s):` link or a bare `#fragment` is left to the surface's own link handling. Link resolution
walks `..` and `.` segments against the showing file's directory, not the process cwd, so a doc
shown by absolute path still resolves its own relative links correctly.

The Doc view opens itself, as the visible pane, the first time a markdown file under a watched path
is written or edited: the built-in plan and spec directories
(`docs/superpowers/plans/`, `docs/superpowers/specs/`, `.superpowers/`) or a `/`-bounded path
segment named in the `watchedPaths` setting. Plan mode's own plan file is not guessed from a
directory: the engine names it on plan mode's notes (`prompt.attachment` of type `plan_mode`,
`plan_mode_exit`, `plan_mode_reentry`, main loop only), Raven watches that exact path from then on,
and leaving plan mode with a plan, or re-entering it, opens the plan. Each path opens by itself
only once (once the Doc view has shown a file, by any route, a later edit reloads it in place rather
than pulling the Doc pane in front of a pane the person switched to), except that leaving or
re-entering plan mode shows the plan again. When the main loop's own edit opened it, that edit's
result tells Claude so ([`agentic.md`](./agentic.md#what-claude-is-told)). These opens, like Tasks
opening on the first task list, pass the `autoOpen` and `autoOpenColumns` gate;
[`settings-and-surfaces.md`](./settings-and-surfaces.md) owns that gate and `watchedPaths`' exact matching rule.
Configurable extras aside, these watched paths are the view's own built-in behavior, not something
another doc owns.

## Files view

The Files view (`plugins/raven/hooks/views/tree-view.tsx`, pane id `raven-files`, subcommand
`files`) lists the repository's tracked and untracked files from `git ls-files --cached --others
--exclude-standard`, capped at 5 000 paths; a longer listing shows a "capped at 5000 files" row
instead of the remainder (`plugins/raven/hooks/views/tree/tree.ts`).

The listing is a dir/file tree, directories sorted before files at each level, both sorted by name.
Rows are one `strip` (a `Client`; plain Buttons on a surface without one): dim `│ ` indentation
guides per depth, a dim Nerd Font chevron (down open, right closed) and a `rainbow_yellow` folder icon
(open or closed) on a directory, a blank where the chevron would be and the coloured file-type icon on
a file. A row lights on the user-message hover tint under the pointer, and the file last opened from
the list holds the selection tint (R41). A directory row carries, dimmed at the right, a count of its changed descendants; a directory
containing a change starts expanded, every other directory starts collapsed, and the person's manual
expand/collapse choices persist across refreshes once they have expanded anything. A file row
carries its type icon and, at the right, a change-status dot and letter mark (added, modified, deleted, renamed,
untracked), computed against `HEAD`, coloured by status the same way the diff pane's file list and
change map are (`hooks/ui/dot.tsx`). Clicking anywhere on a directory row toggles it; clicking a file row opens
it in the Doc view.

Raven colours its chrome (status marks, add/remove counts, errors, comment text) by Claude Code
theme key via `plugins/raven/hooks/core/colors.ts`'s `COLORS` map, never a raw colour; the file-type
icon's brand colour (TypeScript blue and so on) is the one exception, since it identifies the
language rather than the UI.

The view re-runs `git ls-files` only when the file set itself could have changed (an added,
deleted, untracked or renamed entry in the latest change list), not on every refresh; a listing whose
changes are all modifications reuses the previous file list. This keeps the view's refresh cheap on
the same debounce the diff pane uses, landing after `Edit`/`Write`/`NotebookEdit`/`Bash` calls, while
it is open.

## Tasks view

The Tasks view (`plugins/raven/hooks/views/tasks-view.tsx`, pane id `raven-tasks`, subcommand
`tasks`) folds `TodoWrite`, `TaskCreate` and `TaskUpdate` calls into one checklist
(`plugins/raven/hooks/review/tasks.ts`). `TodoWrite` replaces the whole list from its `todos` array;
`TaskCreate` appends one pending task, its id taken from the tool result when present, else the
input, else its position in the list; `TaskUpdate` patches the task matching its id, or removes it
when the update's status is `deleted`. Any input `tasksAfter` cannot parse leaves the list
unchanged rather than clearing it.

The view draws a `sectionHeader` ("Tasks", the accent colour) carrying a `progressBar` (done/total
cells plus the count, `███░░ 3/5`) right-aligned, then one `strip` row per task led by a Nerd Font state icon
(`TASK_STATE_GLYPHS`/`TASK_STATE_COLORS`): a circle pending, a dotted circle in_progress (showing the
task's `activeForm` when set, else its subject), a check completed and dimmed, each in its state's
colour, with the state word dim at the right edge. Task rows are not pressable. With no tasks the pane
shows a dim "No tasks yet."

The view opens itself as a background tab the first time the task list becomes non-empty, but only
when no Raven pane is open yet; it never steals focus from a pane already open, and never reopens
itself once dismissed.

## The drawing kit

Every view draws through the small component kit in `plugins/raven/hooks/ui/`, and no view carries a
box glyph of its own. The kit's one border decision is the `cardStyle` setting
([`settings-and-surfaces.md`](./settings-and-surfaces.md#settings)), resolved once in `register.ts`
into a `Style` (`styleOf` in `plugins/raven/hooks/ui/style.ts`) and handed to every render as
`kit.style`. A `Style` is plain data, one per value:

| `cardStyle` | Group (file card, doc heading) | Title | Compose box | Tables |
| --- | --- | --- | --- | --- |
| `bar` (default) | a `▌` rail per body row, in the status colour | bold row, no rule | `┌┐└┘` | header over one rule |
| `none` | no mark | bold row, a dim `─` rule row under it | `┌┐└┘` | header over one rule |
| `sharp` | one closed `┌┐└┘` frame | in the top border | `┌┐└┘` | full grid, square corners |
| `rounded` | one closed `╭╮╰╯` frame | in the top border | `╭╮╰╯` | full grid, rounded outer corners |

A note's `┃` bar is the same in every style. Doc sections have no closed frame under `sharp` and
`rounded` (the engine wraps their Markdown, so the height is not known); H1 and H2 take a dim rule
instead, see [Doc view](#doc-view). Only the diff and Doc panes have groups, notes and tables to
frame; the Files and Tasks panes draw rows only.

The pieces the panes share:

- **Cards** (`plugins/raven/hooks/ui/card.tsx`): `cardTitle` (a title with its chips inline, two
  columns after it, or the frame's top border), `groupRows` (body rows behind the style's rail or
  sides, with the `◆` mark for a line a note hangs under), `frameBottom` (the closing row of a frame),
  `noteCard` (the `┃` note on the `userMessageBackground` fill) and `boxedCard` (the closed compose
  frame). The cells each takes are named once in `ui/chrome.ts` (`groupCellsOf`: a bar 2, a bare group
  0, a frame 4; `NOTE_CELLS` 2; `BOXED_CELLS` 4), so a width calculation never carries a number of its
  own.
- **Chips** (`ui/chips.ts`, `ui/strip.tsx`): a control is data (`icon`, `label`, a `priority`),
  `chipsLayout` shrinks the lowest-priority chip to its bare icon first until the row fits, and
  `pillRow` draws the result as one `Client` strip. Chips sit inline beside what they act on, never at
  the pane's edge, except the header's and a note's own, which are flush right.
- **Icon and text** (`ui/icon-text.ts`): every site that pairs an icon with a label (pills, card
  titles, the doc title, the file list, the header counts) builds the pair with `iconText` and
  `ICON_GAP`, one space, so the gap is decided in one place. `NOTE_GLYPH` is the note marker
  everywhere (Nerd Font nf-md-message_text_outline, U+F036A): every note chip, count and title uses
  it. On a terminal whose Nerd Font fallback is not a Mono variant a glyph draws wider than its cell
  and overlaps the space after it; the remedy is the terminal's font, not a wider gap.
- **Widths** (`widthOf`, `clustersOf` in `ui/wrap.ts`): the cell width every fit calculation uses.
  Wide characters (CJK, emoji) count 2, combining and zero-width marks 0, a base followed by the
  emoji variation selector VS16 counts 2, and a ZWJ sequence is one cluster of its first emoji's
  width. A Nerd Font glyph counts 1, which matches the engine's own layout.
- **Colour**: every colour is a theme key through `COLORS` (`core/colors.ts`). Colour carries state
  (status, the live-feed accent, note state, active and primary controls); body text stays plain.
  Raven's own fills are the chips, note cards and the compose box, all on `userMessageBackground`, and
  the selected file-list row on `selectionBg`. The pane background is the engine's;
  `paneBackground` is an opt-in fill, see the settings spec.

## Status band

Above the prompt (`AbovePrompt`), one row reads `<mark> <note glyph> N pending  plan updated   open   ➤ send`
(`plugins/raven/hooks/views/band.tsx`, state in `plugins/raven/hooks/core/band-state.ts`): an accent
Raven mark and the notes summary in the suggestion colour (the plan flag dim) on the left, then ` open `
and (only while comments are pending) the primary ` ➤ send ` as right-aligned pills. The row is
three cells narrower than the surface: the engine keeps the band's right edge for its own marker, drawn with the same `hooks/ui/` kit every view uses. It draws
only when something is
pending (pending review comments, or a doc/plan shown since the pane was last visible) and only
while no Raven pane is currently visible, whether the dock is closed or a Raven pane is open
behind another tab. It never draws while a survey holds the band, and sizes itself to the
surface's `bodyColumns` with `wrap="truncate-end"`; `chipsLayout` shrinks ` open ` before
` ➤ send ` gives up its words, the same priority rule as the diff header's own chips.

A doc counts as unseen from the moment it is shown (or reloaded, for a doc the person has opened
here before) until the Doc pane is actually drawn again; the count and the unseen flag both
invalidate the band's render so it updates without a keystroke. The row's ` open ` chip opens
the diff when comments are pending, else the doc; ` ➤ send `, drawn only while comments are
pending, submits the review exactly as `/raven send` does.

## The `/raven` command row

Each `/raven` reply draws as a `CommandOutput` row led by a glyph keyed to the result's kind
(`plugins/raven/hooks/core/command-glyph.ts`): `◆` for `shown` and for `info` (the fallback when no
`command()` call in this session produced the text being redrawn: a replayed transcript, or a
reloaded module), `◇` for `hidden`, and `!` for both `narrow` (the terminal is too small to dock)
and `error`. The controller records which kind each reply's exact text resolved to, so the engine
can ask for that row's glyph again without re-running the command.

## Pane tabs and `/raven` subcommands

`/raven` alone toggles the diff pane, showing it when hidden, hiding it when already the visible
pane. `/raven <subcommand>` toggles the named view: `diff`, `doc`, `files`, `tasks`; toggling a
hidden or backgrounded view opens or brings it forward, toggling the currently visible one hides it.
`/raven send` submits the pending review as a prompt instead of touching a pane, replying "Review
sent" or "No review comments to send". Any other argument replies with usage, listing every view's
subcommand plus `send`. A command that cannot dock its pane (the terminal too narrow) replies with
the fixed "Widen the terminal to dock the Raven pane" text rather than opening nothing silently.

Opening a view when it is already open only brings it forward if it was a background tab; reopening
a pane that is already the visible one is a no-op that still returns success. Closing any Raven pane
removes it from the controller's open set, so a later `/raven` for that view starts from a fresh
open rather than assuming state a closed pane no longer holds.

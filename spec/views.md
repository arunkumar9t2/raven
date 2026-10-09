# Views

Raven's pane is a host for **views**: each owns one engine pane (`id`, `title`), a `/raven
<subcommand>` that toggles it, and a `render(kit)` that draws from its own model. The engine shows
one pane at a time and tabs the rest, so `/raven <subcommand>` brings a background tab forward and
hides a shown one; `/raven` alone means `/raven diff`. The four views — Diff, Doc, Files, Tasks —
share this contract, declared as `View` in `plugins/raven/hooks/core/view.ts`; the diff pane and its
review tools are [`diff-pane.md`](./diff-pane.md)'s concern, this spec covers the other three plus the
chrome around all of them: the status band, the command row, pane tabs and `/raven` subcommands.

**Triggers** map a finished tool call to a list of view actions — `refresh-diff`, `main-loop-edit`,
`show-doc`, `reload-doc`, `directive`, `tasks` — in one registry
(`plugins/raven/hooks/core/triggers.ts`), so adding a view or a new reaction to a tool call is one
entry there, not a change to `register`. `plugins/raven/hooks/core/raven.ts` is the controller that
turns those actions into calls on the views.

## Doc view

The Doc view (`plugins/raven/hooks/views/doc-view.tsx`, pane id `raven-doc`, subcommand `doc`)
renders one document at a time: a markdown file, an image, any other file highlighted by its path
extension, or inline markdown from a `note` directive (see [`agentic.md`](./agentic.md)). It keeps a
history of up to 10 shown documents, deduplicated by a key over the document's kind and path or title,
most recent first; picking an older entry re-shows it without re-reading it from disk.

The pane draws one title row above the body: a shown file with a caller-given title draws that title
in bold beside its full path, dimmed; a file without one draws its full path in bold; a note draws its
title. A markdown
file or note is split by `markdown-chunks.ts` into pieces small enough for the engine's `Markdown`
element, which refuses to draw text over its character cap (`ELEMENT_TEXT_LIMIT`, the same cap `Code`
and `Text` carry — see [`mod-api.md`](./mod-api.md)). Cuts prefer a blank line outside a code fence, so
a code block never splits mid-block; a single block longer than the cap is still cut between lines,
with the fence closed before the cut and reopened after it. Each chunk's fenced code blocks render
through a `Code` element carrying the fence's language, interleaved with `Markdown` elements for the
surrounding prose, so code reads as code rather than as part of the markdown text; an empty fence
draws nothing. GFM tables in prose (outside fences) are split out too and drawn by Raven itself
(`hooks/ui/table.tsx`, layout in `hooks/ui/table-layout.ts`), because the engine's `Markdown` sizes a
table to the terminal, not the pane, so a wide table breaks its borders in a narrower pane. A table
draws at the pane's width (`kit.columns`) with box borders, a centred bold header and body cells
aligned per the delimiter row; `**bold**` and `` `code` `` cells keep their style through wrapping and
other inline markers draw as their visible text. When the natural widths do not fit, columns shrink
(never below their longest word, 6 to 20 cells) and cell text wraps at word boundaries, hard-breaking a
word wider than its column; when even that does not fit, each row draws as a group of `Header: value`
lines. This holds for files, notes, plans and commentable sections alike (R36). A file that is not markdown renders as one `Code` element instead, truncated at the
same cap with a "the rest of the file is not shown" note when it overruns.

The whole body sits in an open card: a `╭─ <icon> <path or title> ───` rule (the file-type icon, or a
document icon for a note), a calm `subtle` `│` border column on every body row, and a `╰───` close. The
border is one absolutely positioned column clipped to the body's height, and the body lays out two cells
narrower so Markdown, Raven-drawn tables and note cards fit inside it. An empty pane draws a dim Nerd Font
icon and a line ("Nothing shown yet — plans and docs Claude writes open here"); the other panes' empty
states (no tasks, no changes, not a git repository) share that shape (`ui/empty.tsx`).

A markdown file — never a note or any other file kind — is also where [review comments](./review.md)
attach: each section draws its own notes (the same margin style a diff hunk's notes use, collapsing
every addressed one into a single dim "✓ N addressed" row exactly as a diff anchor does — one
shared split, `splitAddressed` in `plugins/raven/hooks/review/comments.ts`) beneath its body. Each section opens with a `├─ § <heading> ───` separator carrying, only on a
surface with `canType` and only while that section isn't already being composed, a right-aligned
` ✎ note ` pill; the Markdown omits the section's own heading line, so the heading is drawn once. The
trailing group of comments whose section is gone opens with `├─ Outdated ───`. Only a comment carrying a `section` draws here
— the same discriminator the diff stream's own orphan group uses to leave doc comments out of
itself — so a diff comment (file- or hunk-level) on this same path, shown here only because the
file happens to also be open in this pane, stays out: it belongs to the diff pane's own stream and
draws only there. Controls are keyed by the section's index rather than its heading text, so two
sections sharing a heading never share controls or get their notes crossed; the anchor a comment
carries, and how its "Outdated" group works once a section is gone, is
[`review.md`](./review.md#anchors-and-composing)'s concern — that group collapses its own addressed
comments the same way, grouped by the section identity (heading and index) each one still carries
even though neither names a section on screen any more.
Nothing here draws a note control at all for a `note` directive's inline markdown, for a file that
isn't markdown, or for an image — each keeps the plain, uncommentable rendering it always had.

An image renders as an `Image` element sized to fit the pane's width, but only for `.png` — the one
format the surface reads straight from a file — and only on a surface with `canShowImage`; other
image extensions (`.jpg`, `.gif`, `.webp`) and a surface without `canShowImage` both fall back to
the image's path as dim text. [`settings-and-surfaces.md`](./settings-and-surfaces.md) owns which
surfaces carry which capability, and why presence of the element itself is never checked.

A relative or `file:` link inside a shown markdown file resolves against that file's own directory
(`plugins/raven/hooks/views/doc-links.ts`) and opens the target in the Doc view on press; an
`http(s):` link or a bare `#fragment` is left to the surface's own link handling. Link resolution
walks `..` and `.` segments against the showing file's directory, not the process cwd, so a doc
shown by absolute path still resolves its own relative links correctly.

The Doc view opens itself, as the visible pane, whenever the main loop writes or edits a markdown
file under a watched path: the built-in plan and spec directories
(`docs/superpowers/plans/`, `docs/superpowers/specs/`, `.superpowers/`) or a `/`-bounded path
segment named in the `watchedPaths` setting. Plan mode's own plan file is not guessed from a
directory: the engine names it on plan mode's notes (`prompt.attachment` of type `plan_mode`,
`plan_mode_exit`, `plan_mode_reentry`, main loop only), Raven watches that exact path from then on,
and leaving plan mode with a plan, or re-entering it, opens the plan. These opens, like Tasks
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
carries its type icon and, at the right, a change-status dot and letter mark — added, modified, deleted, renamed,
untracked — computed against `HEAD`, coloured by status the same way the diff pane's file list and
change map are (`hooks/ui/dot.tsx`). Clicking anywhere on a directory row toggles it; clicking a file row opens
it in the Doc view.

Raven colours its chrome — status marks, add/remove counts, errors, comment text — by Claude Code
theme key via `plugins/raven/hooks/core/colors.ts`'s `COLORS` map, never a raw colour; the file-type
icon's brand colour (TypeScript blue and so on) is the one exception, since it identifies the
language rather than the UI.

The view re-runs `git ls-files` only when the file set itself could have changed — an added,
deleted, untracked or renamed entry in the latest change list — not on every refresh; a listing whose
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

The view draws a `sectionHeader` ("Tasks", the accent colour) carrying a `progressBar` — done/total
cells plus the count, `███░░ 3/5` — right-aligned, then one `strip` row per task led by a Nerd Font state icon
(`TASK_STATE_GLYPHS`/`TASK_STATE_COLORS`): a circle pending, a dotted circle in_progress (showing the
task's `activeForm` when set, else its subject), a check completed and dimmed, each in its state's
colour, with the state word dim at the right edge. Task rows are not pressable. With no tasks the pane
shows a dim "No tasks yet."

The view opens itself as a background tab the first time the task list becomes non-empty, but only
when no Raven pane is open yet — it never steals focus from a pane already open, and never reopens
itself once dismissed.

## Status band

Above the prompt (`AbovePrompt`), one row reads `<mark> ✎ N pending  plan updated   open   ➤ send`
(`plugins/raven/hooks/views/band.tsx`, state in `plugins/raven/hooks/core/band-state.ts`): an accent
Raven mark and the notes summary in the suggestion colour (the plan flag dim) on the left, then ` open `
and — only while comments are pending — the primary ` ➤ send ` as right-aligned pills. The row is
three cells narrower than the surface: the engine keeps the band's right edge for its own marker, drawn with the same `hooks/ui/` kit every view uses. It draws
only when something is
pending — pending review comments, or a doc/plan shown since the pane was last visible — and only
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
`command()` call in this session produced the text being redrawn — a replayed transcript, or a
reloaded module), `◇` for `hidden`, and `!` for both `narrow` (the terminal is too small to dock)
and `error`. The controller records which kind each reply's exact text resolved to, so the engine
can ask for that row's glyph again without re-running the command.

## Pane tabs and `/raven` subcommands

`/raven` alone toggles the diff pane — showing it when hidden, hiding it when already the visible
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

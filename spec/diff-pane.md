# Diff pane

The diff pane (`/raven`, pane id `raven`, `plugins/raven/hooks/views/diff-view.tsx`) is Raven's
primary view: a live diff of the working tree, docked beside the transcript, that doubles as the
surface where [review comments](./review.md) are attached to files and hunks. It exists so the
person can watch Claude's edits land and react to them without leaving the terminal or waiting for
Claude to describe what it changed.

## Layout

Two fixed rows form the header (`plugins/raven/hooks/views/diff/header.tsx`): row 1 is counts and
source — `N files  +adds −dels ■■■□□ · source <picker>`, the stat bar scaled to the whole diff's
own total (no `max`); row 2 is the change map (one glyph per file, the shape of the whole change
at a glance — see [below](#the-change-map)), the pending-notes summary, and the action chips —
` ↑ ` ` ↓ ` ` ↻ refresh `, then — once a comment is pending — ` ✎ edit & send ` and the
primary ` ➤ send N ` (the pane's main action), then ` ⌫ clear ` — laid out by `chipsLayout` and drawn as one pill strip (`pillRow`), clear in the danger colours (armed: filled error),
which shrinks the lowest-priority chip to its bare icon first so `send N` keeps its words longest.
While a clear is armed, row 2 drops the nav/refresh chips and the map/notes summary entirely —
nothing competes with the confirm while the person decides. With nothing armed, the same row
degrades instead of vanishing as the pane narrows: ` ↑ ` ` ↓ ` never give way, in words, icons,
or by dropping, since they are the file list's only carriers of the person's own list chords (a `Client` cannot bind an engine chord, so these two draw as `plain` Buttons beside the strip, padded like pills), so
`refresh` gives way first; the change map's own cell count caps at 2 instead of scaling to the
pane's width (two changed files each still draw their own glyph; more than two draw one glyph plus
the overflow `…`); and the notes summary compacts from `✎ N pending` to a bare `✎` (the send chip's
own `➤ N` still carries the count). Beneath it sits the file list
(`plugins/raven/hooks/views/diff/file-list.tsx`), capped at 8 rows: within that cap every changed
file gets a row, and beyond it the list shows a window centered on the selected file plus a
trailing "… N more" row. A one-row rule follows, then the body: **one review stream**, holding
every changed file's section at once — its heading (status mark, icon, bold path, `+adds` `−dels`,
and a right-aligned ` ✎ note ` chip), then its file-level notes, then each hunk in turn: its
toolbar row (the hunk's function context and line range, and — unless read-only — right-aligned
` ✎ note `, ` ✓ stage `, ` ↺ revert ` pills), its code, its own notes, then (only while that hunk
is being composed) its compose box — a blank row between one file's section and the next, no
blank row between hunks (`streamOf` in `plugins/raven/hooks/views/diff/blocks.ts`). Every row of a
file's section — heading, notes, each hunk's toolbar and code — draws behind a 2-column left rail,
`▌ `, in the file's status colour; the file being edited this turn draws its rail in the accent
colour instead, so the live feed is visible without reading any text (see
[Live feed](#live-feed)). A file's heading carries the same status mark, icon and `+adds`/`−dels`
as its file-list row and the same bold path (`bodyRowOf`'s `'title'` case in `diff-view.tsx`) —
except for a renamed file, whose heading shows only its new path; the `old → new` label is the
file-list row's alone. The whole stream is laid out into one scrollable window so wheel and
arrow-key scrolling moves through it without redrawing the header or file list
(`plugins/raven/hooks/views/diff/layout.ts`). The fixed rows above that scrolling body total 2
(header) + min(file count, 8) (file list) + 1 (rule). Within the body, a heading, a status line, the
collapsed "✓ N addressed" row, a hunk's toolbar row, the "Outdated" title, the "Not in
this diff" title, an orphan path's own row, and the blank row between files are each one row; a
note is a card of as many rows as its text wraps to at the stream's width (1 to 6, see
[review](review.md#status)); a note chip draws idle on the heading or a hunk's toolbar row
rather than as a row of its own, and opens a compose box in its place — two rows (Input plus
the `⏎ add`/` ✕ cancel ` hint row), three when a hunk's line picker draws above the Input — only
while that anchor is being composed. A multi-row fixed block's rail runs its full height. A card the scroll position cuts through stays
placed and is clipped at the top (`windowOf` places it from its first visible row), so the rows
below never shift; the compose box is `pinned` and always placed whole. A hunk with line notes is several `hunk`
blocks, each a body-line `range` — the lines up to and including a commented line, that line's
cards, then the rest — keyed `hunk:<i>:<header>` and `…~<from>`; rows stay exact because the
segments' lines and the cards' rows sum to the hunk plus the notes, and `sliceHunk` renumbers each
segment's gutter. See [review](review.md#status) for what draws on the commented line. A hunk itself takes as many rows as its body has lines, sliced into whatever range the
current scroll position exposes, and a fixed row only draws once its first row falls inside that
range. Element caps, focus, and the scroll contract these elements draw under are engine facts
owned by [`mod-api.md`](./mod-api.md).

### The change map

Row 2's left side draws a change map (`plugins/raven/hooks/ui/change-map.tsx`): one glyph per
changed file, chosen from `▁▂▃▄▅▆▇█` by that file's share of the *largest single file's* change
in the set (`max = Math.max(1, ...sizes)`, `ratio = size / max` — the file with the most changed
lines always draws `█`, every other file scaled against it, not against the diff's total) — a
skyline of the change set before reading any of it. Each glyph is coloured by the file's status;
the file being edited this turn draws in the accent colour, same as its rail. A changed file
never draws below `▁` even next to a much larger one, so nothing goes invisible. More files than
fit the row's share of `kit.columns` keep the first few and end with one dim `…` cell rather than
wrapping or dropping files silently.

A file's section shows only its own comments — and, for a renamed file, comments made under its
old path too (`belongsTo` in `plugins/raven/hooks/views/diff/blocks.ts`) — and only diff comments:
a doc comment (one carrying `section`) never draws here even when its path happens to match this
file's exactly, which it can when the same markdown file is also open in the [Doc
view](./views.md#doc-view) by its git-relative path; comments themselves are
[`review.md`](./review.md)'s concern.

### Comments outside the diff

A comment whose path matches no file in the stream at all — the selected source moved past it, or
the file is gone from the working tree — never disappears: it draws instead in a closing "Not in
this diff" group at the end of the stream, a dim title row followed by each such path's own row
(the bare path, with a dim "file gone" beside it only once a batched existence check has confirmed
it — a path never checked, or one a failed check couldn't confirm, draws no "file gone" label:
fail open) and that path's notes beneath it, same resend/✕ chips and addressed-collapse as a live
comment's (`orphanBlocksOf` in `plugins/raven/hooks/views/diff/blocks.ts`). An empty group draws
nothing, rather than a bare heading. [`review.md`](./review.md#delivery) owns when a comment is
treated as live versus carried here only as something to look at later.

## The file list navigates the stream

Pressing a file's row (`select(path)`) scrolls the stream so that file's heading is as near the
top as the stream's remaining length allows — a file with enough content below it lands exactly at
the top; one near the end of a short stream scrolls as far as the stream goes and no further
(`clampTop` in `plugins/raven/hooks/views/diff/layout.ts`) — and marks the pressed file's row with
`❯`, without reloading anything. Scrolling the stream instead — wheel, or the file list's `↑`/`↓`
Buttons (below) — moves the list's `❯` to whichever file's heading is now at the top of the body
(`fileAtRow` in `plugins/raven/hooks/views/diff/blocks.ts`): a press sets where the stream scrolls
to; a scroll sets which file the list marks. `↑`/`↓` step the selection to the adjacent file in
list order and scroll to it the same way pressing its row does.

## Live feed

A file an `Edit`/`Write`/`NotebookEdit`/`MultiEdit` call changes during the current turn — from the
main loop or a subagent — draws a trailing `◉` in `COLORS.accent` in its file-list row, after its
`+adds`/`−dels` counts and stat bar (`plugins/raven/hooks/views/diff/file-list.tsx`); the same file
also draws its stream section's left rail and its change-map glyph in the accent colour, so the
live feed is visible from the file list, the map, or the stream itself. The mark clears once the
turn ends, on any main-loop turn-completion reason — an answer, an interrupt, or an error — not
only a clean answer.

**Follow:** while the person has not scrolled or pressed a file row this turn, a landed edit
scrolls its file's heading into view once the refresh after it completes. A person's scroll or
file-list press — wheel, the file list's `↑`/`↓`, or pressing a file row — turns follow off until
the next turn; a programmatic jump (a `diff` directive naming a path) never does. Follow never
jumps while a comment's compose box is open: it keeps the pending target and tries again on the
next refresh rather than dropping it.

## Sources

A `Select` in the header (falling back to a row of plain buttons on a surface without `canPick` —
see [`settings-and-surfaces.md`](./settings-and-surfaces.md)) chooses what the working tree is
diffed against: `HEAD` (default), `session start`, `branch point`, or one `turn N — <prompt>` per
turn that edited files, newest first. `HEAD`, `session start`, and `branch point` persist per
repository in `$.store`, keyed by the repository's toplevel path, so the choice survives a session
restart; picking a turn does not persist.

`session start` is `HEAD` as it stood at this module instance's first successful refresh — a hot
reload of the mod resets it, since it lives only in memory. `branch point` is `HEAD`'s merge-base
with the repository's default branch, resolved as origin's `HEAD` symref, else `main`, else
`master`; the option is left off the picker entirely when none of those resolves
(`plugins/raven/hooks/git/base.ts`).

Picking a turn switches the file list and hunks to that turn's edited files instead of a git diff:
synthetic hunks built from the turn's `Edit`/`MultiEdit`/`Write`/`NotebookEdit` calls
(`plugins/raven/hooks/review/turns.ts`). This source is read-only — no comment boxes, no
stage/revert — and it replaces the file list entirely: a turn's files are the only ones shown, so
an untracked file never appears there. Each file's heading is its own path, the same as for any
other source: the header's source picker is what names the turn, so the heading itself only needs
to say which file.

The file list itself is always built from `git status` against HEAD, regardless of the selected
source; only a file's hunks and add/del counts are read against that source. Selecting
`session start` or `branch point` changes what a listed file's hunks and counts show, but does not
add a file whose only difference from that older base is already committed at HEAD, since nothing
currently in the working tree differs from HEAD there. Untracked files, found the same way, show
against every git-based source: their hunks come from a diff against `/dev/null`, and their add
counts come from a per-file diff against `/dev/null` for up to 50 untracked files — past that limit
they show `+0` rather than spawn a git process per file
(`plugins/raven/hooks/git/load.ts`).

## Reading hunks

A refresh reads every tracked file's hunks in one process — `git diff -M <base>` against the whole
working tree, no pathspec — and splits the output per file by its `diff --git` sections
(`diffSectionsOf`, `loadAllHunks` in `plugins/raven/hooks/git/load.ts`); `-M` gives this read
rename detection too. Each untracked file is read on its own, `git diff --no-index` against
`/dev/null`, one process per file up to the same 50-file limit the file list's add counts use —
past that limit, and on any single file's read failing, that file's section shows "Not read"
instead of hunks.

A run's output can be cut at the engine's cap (see [`mod-api.md`](./mod-api.md)); `loadAllHunks`
treats a cut this way: the file whose section the cut falls inside keeps its complete hunks up to
the cut and drops only its last, partial one (toasting `${path}: diff too large, its last hunk is
not shown`); every tracked file after the cut section is missing from that one process's output
entirely, so `loadAllHunks` re-reads those files together, each with its own single-file diff,
rather than folding them into the cut run's output. A non-zero exit from the combined diff (a bad
revision, for instance) throws rather than reading every tracked file as unchanged.

## Refresh

A landed `Edit`/`Write`/`NotebookEdit`/`MultiEdit` call, or any `Bash`/`PowerShell` call whether or
not it landed — a failed or interrupted shell command may still have written files — schedules a
single refresh, debounced 300ms, while the diff pane (or the Files view, which shares the debounce)
is open. A main-loop edit — one not made by a subagent — additionally evaluates whether to open the
diff pane, but only once per session: the first main-loop edit is the only one ever checked, so a
terminal too narrow on that first edit is never retried later even if it widens. That check is
gated on the `autoOpen` and `autoOpenColumns` settings; that gate and the rest of Raven's settings
are owned by [`settings-and-surfaces.md`](./settings-and-surfaces.md). On the first `/raven` or the
first main-loop edit, a one-time toast also suggests closing the built-in diff panel when it is
open (or its state can't be read) and checkpointing is on, since that panel would otherwise cover
Raven's dock — see [`settings-and-surfaces.md`](./settings-and-surfaces.md) for the exact conditions
checked.

## Keys

No control carries a letter hotkey; every action is reachable by click and by Tab+Enter. The file
list's `↑`/`↓` Buttons carry `action="app:diffFileListUp"`/`"app:diffFileListDown"`, so they answer
the person's own chords for the built-in diff list (ctrl+↑/↓ by default) as well as a click. A
file's note chip, right-aligned on its heading row, is the ` ✎ note ` pill; a hunk's, on its toolbar
row alongside the stage and revert pills, is the ` ✎ note ` pill — the heading's shrinks to its bare
icon (` ✎ `) under `chipsFit`/`chipsLayout` when the row is too narrow for every chip's words, the
heading's path giving way first; the toolbar's pills shrink to bare icons the same way. Submitting or cancelling a comment returns the
keyboard to that anchor's note chip, so Esc/Enter flow stays inside the pane rather than jumping
to the composer.

## Stage and revert one hunk

Each hunk in a non-read-only source carries its toolbar's right-aligned **pills**, drawn as one
`Client` strip (`hooks/ui/strip.tsx`; [mod-api](./mod-api.md#client-and-uimessage)): ` ✎ note ` (when
the surface has `canType` and the hunk isn't being composed), then ` ✓ stage `, then ` ↺ revert ` —
coloured text on a tinted background, no brackets, the background lighting under the pointer; icons
only (` ✎ `, ` ✓ `, ` ↺ `) once the row is too narrow for every pill's words. A left click posts the
pill's id, which the press registry maps to the same handler a `Button` would have run. On a surface
without `canClient` the same labels draw as `plain` Buttons. Before either runs, Raven re-reads that one file's current hunks and requires an exact
header-and-text match against the hunk the button was drawn for. A mismatch — the working tree
moved since the last render — toasts "The hunk changed — refreshed, try again", refreshes the
whole stream with the current hunks, and applies nothing.

`stage` runs `git apply --cached --recount` against a patch built for that one hunk
(`plugins/raven/hooks/git/patch.ts`); once it succeeds the pill reads ` ✓ staged ` (` ✓ ` in icons
mode) in the `on` kind (success colour) and stops responding until a refresh drops the mark, which
happens once the hunk's header no longer appears in a fresh load. `revert` runs `git apply -R
--recount` on the same patch, restoring the working tree; the first press turns the pill into the
`armed` kind — ` ↺ sure? ` on a filled error background, keeping its words even when the other pills
shrink to icons — and any other action anywhere in the pane — including a background refresh or a
scroll, not only a deliberate one — resets that arming, so a second, immediately-following press is
what applies it. Reverting an added or untracked file's
one hunk deletes the file outright: its forward patch is "create this file", so `git apply -R`
undoes that. Either way, success re-reads and re-renders every file's hunks — the same refresh
[above](#reading-hunks) — not just the one file the hunk belonged to.

The hunk applied is always the one computed against the pane's *selected* source, not necessarily
HEAD: this is consistent when the source is `HEAD`, since the index `--cached` targets and the
working tree `-R` targets are HEAD-relative too, but choosing `session start` or `branch point`
still offers stage/revert on hunks diffed against that older commit while the index and working
tree it applies to remain what they are regardless of the picker.

A renamed file's patch carries synthetic `rename from`/`rename to` header lines alongside its old
and new paths; without them `git apply` reads the hunk as a diff of the file against itself. Its
hunks come from a rename-detecting diff either way: the stale-hunk re-check above reads that one
file with its own `git diff -M` against both paths, and the stream's own hunks come from the same
`-M` flag on the one combined read [above](#reading-hunks) — so a rename carrying a content edit
shows the edit rather than the whole file as newly added in both places.

## Long hunks

A hunk loaded from git is bounded by row count, not character length: it is windowed into whatever
rows of it the current scroll position exposes. That bounds how many lines reach the `Code`
element, not their total length, so a screen's worth of unusually long lines can still exceed the
engine's per-element character cap with nothing here to truncate it. A turn source's synthetic
hunks have no natural boundary to window against — a `Write` of a whole file becomes one hunk with
no `@@` breaks to page through — so those alone are clamped at construction time to that same cap
(see [`mod-api.md`](./mod-api.md)), cut at a line boundary with a trailing "… (N more lines)" marker
(`plugins/raven/hooks/git/hunks.ts`, `clampHunk`, called from
`plugins/raven/hooks/review/turns.ts`). An oversized git hunk has no equivalent safeguard.

## Icons

Each file row carries a Nerd Font glyph chosen by extension or filename
(`plugins/raven/hooks/views/icons.ts`) and a colored one-letter status mark — `A`/`M`/`D`/`R`/`U`
for added, modified, deleted, renamed, and untracked. A renamed file's row label reads
`old → new`.

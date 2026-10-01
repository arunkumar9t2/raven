# Diff pane

The diff pane (`/raven`, pane id `raven`, `plugins/raven/hooks/views/diff-view.tsx`) is Raven's
primary view: a live diff of the working tree, docked beside the transcript, that doubles as the
surface where [review comments](./review.md) are attached to files and hunks. It exists so the
person can watch Claude's edits land and react to them without leaving the terminal or waiting for
Claude to describe what it changed.

## Layout

Two fixed rows form the header: counts (`N files`, `+adds`, `−dels`) and the source picker on top;
file navigation (`↑`/`↓`), refresh, then — once a comment is pending — "edit & send" and the
primary "send N" button (`variant="primary"`, the pane's main action), then clear, below
(`plugins/raven/hooks/views/diff/header.tsx`). Beneath it sits the file list
(`plugins/raven/hooks/views/diff/file-list.tsx`), capped at 8 rows: within that cap every changed
file gets a row, and beyond it the list shows a window centered on the selected file plus a
trailing "… N more" row. A one-row rule follows, then the body: **one review stream**, holding
every changed file's section at once — its heading, file-level notes and `＋ note on file`, then
each hunk with its own notes, `＋ note on hunk` and stage/revert row — one after another, a blank
row between files (`streamOf` in `plugins/raven/hooks/views/diff/blocks.ts`). A file's heading
carries the same status mark, icon and `+adds`/`−dels` as its file-list row and the same bold path
(`bodyRowOf`'s `'title'` case in `diff-view.tsx`) — except for a renamed file, whose heading shows
only its new path; the `old → new` label is the file-list row's alone. The whole stream is laid
out into one scrollable window so wheel and arrow-key scrolling moves through it without redrawing
the header or file list (`plugins/raven/hooks/views/diff/layout.ts`). The fixed rows above that
scrolling body total 2 (header) + min(file count, 8) (file list) + 1 (rule). Within the body, a
heading, a status line, a note, the collapsed "✓ N addressed" row, a hunk's stage/revert row, the
"Outdated" title, and the blank row between hunks or between files are each one row; an idle
comment button is one row, a composing box two (Input plus cancel), three when a hunk's line
picker draws above the Input. A hunk itself takes as many rows as its body has lines, sliced into
whatever range the current scroll position exposes, and a fixed row only draws once its first row
falls inside that range. Element caps, focus, and the scroll contract these elements draw under
are engine facts owned by [`mod-api.md`](./mod-api.md).

A file's section shows only its own comments — and, for a renamed file, comments made under its
old path too (`blocksOf`'s path filter in `plugins/raven/hooks/views/diff/blocks.ts`); comments
themselves are [`review.md`](./review.md)'s concern.

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
main loop or a subagent — draws `●` in `COLORS.modified` in its file-list row, after its
`+adds`/`−dels` counts (`plugins/raven/hooks/views/diff/file-list.tsx`). The mark clears once the
turn ends, on any main-loop turn-completion reason — an answer, an interrupt, or an error — not
only a clean answer.

**Follow:** while the person has not scrolled the stream during the current turn, a landed edit
scrolls its file's heading into view once the refresh after it completes. Any person-originated
scroll this turn — wheel, the file list's `↑`/`↓`, or pressing a file row — turns follow off for
the rest of the turn; the next turn turns it back on. Follow never jumps while a comment's compose
box is open: it keeps the pending target and tries again on the next refresh rather than dropping
it.

## Sources

A `Select` in the header (falling back to a row of plain buttons on a surface without `Select` —
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
file's comment button reads "＋ note on file", a hunk's "＋ note on hunk" — each names what it
attaches to. Submitting or cancelling a comment returns the keyboard to that anchor's comment
button, so Esc/Enter flow stays inside the pane rather than jumping to the composer.

## Stage and revert one hunk

Each hunk in a non-read-only source carries a stage/revert row under its comment box. Before
either runs, Raven re-reads that one file's current hunks and requires an exact header-and-text
match against the hunk the button was drawn for. A mismatch — the working tree moved since the
last render — toasts "The hunk changed — refreshed, try again", refreshes the whole stream with
the current hunks, and applies nothing.

`stage` runs `git apply --cached --recount` against a patch built for that one hunk
(`plugins/raven/hooks/git/patch.ts`); once it succeeds the button reads `staged ✓` and stops
responding until a refresh drops the mark, which happens once the hunk's header no longer appears
in a fresh load. `revert` runs `git apply -R --recount` on the same patch, restoring the working
tree; the first press relabels the button "revert? press again", shown at full strength (no colour
change — `Button` has no colour prop), and any other action anywhere in the pane — including a
background refresh or a scroll, not only a deliberate one — resets that arming, so a second,
immediately-following press is what applies it. Reverting an added or untracked file's
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

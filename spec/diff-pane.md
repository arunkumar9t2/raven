# Diff pane

The diff pane (`/raven`, pane id `raven`, `plugins/raven/hooks/views/diff-view.tsx`) is Raven's
primary view: a live diff of the working tree, docked beside the transcript, that doubles as the
surface where [review comments](./review.md) are attached to files and hunks. It exists so the
person can watch Claude's edits land and react to them without leaving the terminal or waiting for
Claude to describe what it changed.

## Layout

From the top, the pane is the header, the file list, a one-row rule, and the body: **one review
stream** holding every changed file as a card. Everything above the body is fixed; the body
scrolls. The drawing kit that frames cards, notes and chips (`Style`, `cardStyle`) is
[`views.md`](./views.md#the-drawing-kit)'s concern; this spec names the rows each piece takes.

### Header

The header (`plugins/raven/hooks/views/diff/header.tsx`, plan in `header-plan.ts`) is **one row** when
it fits: a Nerd Font git mark (`COLORS.git`), `N files`, `+adds −dels`, the [change
map](#the-change-map), a dim `·`, the source picker (`source <value> ▾`), the notes summary once a
comment is pending (`✎ N notes pending`, given up first), and, flush right, the action chips. The
chips are ` ↑ ` ` ↓ ` ` ↻ refresh `, the [side-by-side toggle](#side-by-side) ` ◫ split ` or ` ≡ unified `,
then, once a comment is pending, ` ✎ edit & send ` and the primary ` ➤ send N ` (the pane's main
action), then ` ⌫ clear ` (`headerChipsOf`). `chipsLayout` sizes them in the room the left cluster
leaves and shrinks the lowest-priority chip to its bare icon first: refresh (1), split (1.5), clear
(2), edit & send (3), send (4), so `send N` keeps its words longest. A stat bar is not drawn here;
the map shows the shape of the change and each file-list row keeps its own bar.

`headerPlanOf` picks the form. The one-row form is used when the left cluster at its sparest (map
at 2 cells, no notes summary) plus every chip as a bare icon fits `columns`; spare room goes first to
the map (up to 12 cells, one per file) and then to the notes summary. Otherwise the header takes
**two rows**: counts and source on the first, the map and notes summary on the left of the second
with the chips right-aligned. The two-row form keeps the narrow-pane rules: with a clear armed it drops
nav, refresh, split and the map and notes summary entirely, so nothing competes with the confirm;
with nothing armed it degrades instead of vanishing. ` ↑ ` ` ↓ ` never give way, in words, icons or by
dropping, since they are the file list's only carriers of the person's own list chords (a `Client`
cannot bind an engine chord, so these two draw as `plain` Buttons beside the strip, padded like
pills); `refresh` gives way first; the map caps at 2 cells instead of a third of the width (two
changed files each still draw their glyph; more than two draw one glyph plus the overflow `…`); and
the notes summary compacts to a bare `✎`. Armed clear is drawn in the error colours, filled, and
keeps its words in either form. The source label is cut to 24 cells with a trailing `…`
(`sourceLabelOf`) so a long turn prompt cannot outgrow its counted width.

### File list

Beneath the header sits the file list (`plugins/raven/hooks/views/diff/file-list.tsx`), capped at 8
rows: within that cap every changed file gets a row, and beyond it the list shows 7 files centered on
the selected one plus a trailing "… N more" row. The rows are one `strip` (`Client`): each draws `❯`
on the selected file, the status dot and letter, the coloured file-type icon, the path, and
right-aligned `+a −d` and the stat bar. A row lights on `userMessageBackgroundHover` under the
pointer and the selected file's row holds `selectionBg`; the selected row takes no second tint from
hover (`rowBackgroundOf` in `plugins/raven/hooks/surface/strip.tsx`). A click anywhere on a row jumps to
that file (without a `Client`, the path is a plain Button). The fixed rows above the body total the
header (1 or 2) + min(file count, 8) + 1 (the rule), `fixedRowsOf` in
`plugins/raven/hooks/views/diff/blocks.ts`.

### File cards

Each file is a card built by `blocksOf`; `streamOf` strings the cards together with one blank row
between neighbours (a `#sep` block that belongs to no card), so air, not a rule, separates files.
Content is never boxed. The card's rows, top to bottom, are:

- **Title**, 1 row (2 under `cardStyle: none`, which adds a dim `─` rule row; under `sharp` and
  `rounded` the title is the frame's top border). It reads `<icon> <path>  <status> +adds −dels`,
  then a dim `new file` or `deleted` tag for a [whole file](#whole-files): a Nerd Font file-type icon
  coloured by type (`views/icons.ts`), a gap (`ICON_GAP`), the bold path, the status mark and the
  counts (a zero side is left out). A renamed file's title shows only its new path; the `old → new`
  label is the file-list row's alone (`titleRowOf` in `diff-view.tsx`). The file's ` ✎ note ` chip
  draws **inline**, two columns after the title, never at the pane's edge; it shrinks to its bare
  icon when the row is too narrow for the words, the path (which truncates) giving way first.
- A blank row (`title-gap`), always.
- The file's own notes and, only while it is being composed, its compose box, then a blank row
  (`file-gap`); absent when there are none.
- Each hunk in turn: a blank row before every hunk but the first, a **label row**, the code, its own
  notes, then (only while that hunk is being composed) its compose box. The label row (`hunkToolbar`)
  is plain text with no rule: `ƒ name  L1–7`, and, unless read-only, the ` ✎ note `, ` ✓ stage `,
  ` ↺ revert ` pills two columns after it, shrinking to icons together under `chipsFit`. The label is
  the function context git gives, and the line range, which is the new side's, or the old side's when
  the new side is empty (a pure deletion, a deleted file). A trailing `{` or `(` on the context is
  dropped. A prose file (`isProsePath` in `views/diff/hunk-label.ts`: a markdown, text, rst or adoc
  extension, no extension at all, or any extension not on the code list; named build files such as
  `Makefile` are code) draws the bare range, since git's heuristic picks an arbitrary sentence there.
- An "Outdated" group (a blank row, a dim `Outdated` row, then the stale hunks' notes), see
  [review](./review.md#anchors-and-composing).
- Under `sharp` and `rounded` only, a closing row (`└────┘` / `╰────╯`).

A file with no hunks has one status row ("Loading…", "Not read", "Binary file", "No textual
changes") in place of hunks, inside the card. Body rows draw behind the style's mark: `▌ ` in the
file's status colour under `bar` (the default), nothing under `none`, `│ ` and ` │` under a frame
(`groupRows` in `plugins/raven/hooks/ui/card.tsx`). The rail runs through the blank rows between
hunks, but not through the blank row under a title, the title itself, the closing row or the row
between files, which span the width. The file being edited this turn draws its rail (or frame) in
the accent colour instead of its status colour, so the live feed is visible without reading any
text (see [Live feed](#live-feed)); `none` draws no rail, so there the cue is the file list and the
map alone.

The whole stream is laid out into one scrollable window so wheel and arrow-key scrolling moves
through it without redrawing the header or file list (`plugins/raven/hooks/views/diff/layout.ts`).
Within the body a title, a closing row, a status line, the collapsed "✓ N addressed" row, a hunk's
label row, the "Outdated" title, the "Not in this diff" title, an orphan path's own row and every
blank row are each one row; a note takes 2 to 7 rows and a compose box 3 to 6 (see
[review](./review.md#status)); a hunk takes as many rows as its body has lines (as its side-by-side
rows when [split](#side-by-side)), sliced into whatever range the current scroll position exposes,
and a fixed row only draws once its first row falls inside that range. A card the scroll position
cuts through stays placed and is clipped at the top (`windowOf` places it from its first visible
row), so the rows below never shift; the compose box is `pinned` and always placed whole. A hunk with
line notes is several `hunk` blocks, each a body-line `range` (the lines up to and including a
commented line, that line's cards, then the rest) keyed `hunk:<i>:<header>` and `…~<from>`; rows
stay exact because the segments' lines and the cards' rows sum to the hunk plus the notes, and
`sliceHunk` renumbers each segment's gutter. See [review](review.md#status) for what draws on the
commented line. A card's blocks are keyed `<path>#<block key>`, but a placed row finds its file from
the block's own `card` (the exact path) rather than by parsing the key, so a path containing `#`
works. Element caps, focus, and the scroll contract these elements draw under are engine facts owned
by [`mod-api.md`](./mod-api.md).

#### Whole files

An untracked file, a staged new file (`added`) and a deleted file are wholly one side, so their
hunks draw as **source**, not as a diff: `Code` with `format: 'source'`, `startLine` (the hunk's own
start, renumbered by `sliceHunk`, so a slice cut mid-file or by a note still numbers correctly) and
the file's language, which gives syntax colours without a solid green or red fill. The rail takes the
file's status colour, and the title carries `new file` or `deleted` (`wholeSourceOf`,
`fileTagOf` in `views/diff/whole-file.ts`). A `\ No newline at end of file` marker draws dim under the
source. A source over the `Code` cap is cut into pieces at line boundaries (`wholePiecesOf`), each
numbered on from the one before, and one line over the cap is cut hard. Line notes anchor by line
number exactly as on an all-`+` hunk. A hunk whose lines are not all of the one side falls back to
the diff, and a whole file never draws [side by side](#side-by-side).

#### Pinned title

When the body's top row lies inside a card whose title has scrolled above it, that file's title is
drawn as the body's first row and the stream's rows start one below (`pinnedTitleOf`, `viewOf` in
`layout.ts`), so the file being read always stays named. The pin overlays the row at `top`, so the
stream's last row stays reachable at the maximum scroll. It never shows on a title's first row, on
the blank row between files or over the trailing groups (their blocks carry no `card`), so it hands
off to the next file's title as that one reaches the top; with fewer than two body rows nothing pins.
The pinned row is the title line alone (no rule under `none`) and carries the real title's chips,
which are not placed while it is pinned.

#### Notes and the compose box

A note is a `┃` bar in its state colour on the subtle `userMessageBackground` fill, no frame in any
style: a header row (status word, line, age, `resend` and `✕` chips) and its wrapped text lines.
The compose box is the only frame the pane draws. Rows, widths and states are
[review](./review.md#status)'s concern. In `bar` and `none` the compose box sits at the code's left
edge with the rail not running through its rows; under a frame style it sits inside the frame's
sides.

### The change map

Row 2's left side draws a change map (`plugins/raven/hooks/ui/change-map.tsx`): one glyph per
changed file, chosen from `▁▂▃▄▅▆▇█` by that file's share of the *largest single file's* change
in the set (`max = Math.max(1, ...sizes)`, `ratio = size / max`: the file with the most changed
lines always draws `█`, every other file scaled against it, not against the diff's total), a
skyline of the change set before reading any of it. Each glyph is coloured by the file's status;
the file being edited this turn draws in the accent colour, same as its card's rail. A changed file
never draws below `▁` even next to a much larger one, so nothing goes invisible. More files than
fit the row's share of `kit.columns` keep the first few and end with one dim `…` cell rather than
wrapping or dropping files silently.

A file's section shows only its own comments and, for a renamed file, comments made under its
old path too (`belongsTo` in `plugins/raven/hooks/views/diff/blocks.ts`), and only diff comments:
a doc comment (one carrying `section`) never draws here even when its path happens to match this
file's exactly, which it can when the same markdown file is also open in the [Doc
view](./views.md#doc-view) by its git-relative path; comments themselves are
[`review.md`](./review.md)'s concern.

### Comments outside the diff

A comment whose path matches no file in the stream at all (the selected source moved past it, or
the file is gone from the working tree) never disappears: it draws instead in a closing "Not in
this diff" group at the end of the stream, a dim title row followed by each such path's own row
(the bare path, with a dim "file gone" beside it only once a batched existence check has confirmed
it; a path never checked, or one a failed check couldn't confirm, draws no "file gone" label:
fail open) and that path's notes beneath it, same resend/✕ chips and addressed-collapse as a live
comment's (`orphanBlocksOf` in `plugins/raven/hooks/views/diff/blocks.ts`). An empty group draws
nothing, rather than a bare heading. [`review.md`](./review.md#delivery) owns when a comment is
treated as live versus carried here only as something to look at later.

## Side-by-side

A wide body draws each hunk as two columns, removed lines on the left and added lines on the right,
instead of one unified column. The decision, the pairing and the rows live in
`plugins/raven/hooks/views/diff/split-mode.ts`, `split.ts` and `split-layout.ts`; the drawing is
`split-view.tsx`.

**When.** `splitModeOf` decides from three inputs. Below a body width of 40 columns
(`SPLIT_MIN_COLUMNS`) nothing splits and the header chip is not offered, since two sides could not
hold a gutter and some text. Otherwise a forced mode wins, and with none the diff splits when the
pane is at least `splitColumns` wide (default 160, about 78 columns a side after the gutter and
divider; see [`settings-and-surfaces.md`](./settings-and-surfaces.md#settings)). The threshold is
compared with the pane's columns and the 40-column minimum with the body's width (the pane less the
card's rail, `contentWidthOf`). Every source splits the same way, a turn's included.

**The forced mode.** The header's [split chip](#header) names the layout a press switches to
(` ◫ split ` while unified, ` ≡ unified ` while split) and forces it, in either direction. The forced
mode persists per repository in `$.store` under `split:<toplevel>` (`splitStoreKeyOf` in
`plugins/raven/hooks/names.ts`) with the value `split` or `unified`; any other stored value reads as
"by width". It is read once when a repository is first seen, and a press made while that read is in
flight wins over the late value. Below the minimum width a press does nothing, so no choice is stored
that would change nothing now and surprise the person once the pane grows. Flipping the layout changes
every row count, so the scroll position re-anchors in the new stream: to the open compose box if
there is one (its Input must stay mounted), else to the selected file's title; a line picked for the
compose box survives unless the new layout does not offer it.

**Rows.** A hunk is cut into runs. A context line is one row with its text on both sides. A change
run (consecutive removed and added lines, in any order) pairs its removed lines with its added lines
by position, the shorter side padded with blank rows after the pairs, so the columns stay aligned. A
`\ No newline at end of file` marker is not a row in split view (unified still shows it). Each side
keeps its own line numbers, in a gutter as wide as the largest number in the whole hunk, so a hunk
sliced by a note keeps its siblings' width. A hunk contributes one terminal row per split row, and
`rowsOf` in `layout.ts` reports that count, so scrolling and the pinned title work unchanged. Lines
truncate (`wrap: 'truncate-end'`) rather than wrap, since a wrapped line on one side would push the
sides out of step, and a line over 1 000 characters is cut before it is drawn (`LINE_CAP`). The two
sides share the body less a one-column `│` divider.

**What never splits.** A [whole file](#whole-files) (one column would be blank) and any hunk with
text on only one side, such as a turn's `Write`, stay unified inside an otherwise split body
(`splitsAsColumns`).

**A turn's clamp marker.** A turn source clamps an oversized synthetic hunk with a trailing
` … (N more lines)` line (see [Long hunks](#long-hunks)). In split view that line is a marker row
with neither side: one dim line across the whole body.

**Rendering.** This paragraph is the one place the candidate drawings differ; the kept one is
selected by `SPLIT_RENDER` in `plugins/raven/hooks/views/diff/split-view.tsx`. Three are built.
*A (syntax and a marker strip)* draws each side of each run as a `Code` with `format: 'source'`,
`startLine` and the file's language, with a one-column `▌` strip beside it in the added or removed
colour on change rows; syntax colours are kept and the line colour is the marker alone. *B (red and
green rows)* draws each row as a `Text` with a full-side `backgroundColor` in the diff add or remove
key, a dim gutter, and no syntax colours. *B′ (B plus word highlights)* is B with the changed words of
a paired row drawn on the brighter word fills, from Raven's own token-level diff (`wordDiffOf`: a
longest common subsequence over word, space and punctuation tokens; a line over 120 tokens, or two
lines that share no word, are changed whole). The engine draws its word highlights only in unified
`Code`, so only B′ has them in split view.

**The 10 000-character cut.** `Code` refuses text over its cap (`ELEMENT_TEXT_LIMIT`), and in
candidate A each side of each run is one `Code`. `piecesOf` cuts a run into row pieces so that, on
each side, a piece's source (each line plus its newline) stays within the cap; both sides cut at the
same rows, which keeps the columns aligned, and every piece takes at least one row. A single line is
already bounded by `LINE_CAP`.

**Comments.** Anchors are the same as in unified, with one difference in what is offered. A new line
note anchors to a new-side line only: the compose box's picker lists the hunk's added lines, and a
line picked in unified that split does not offer (an old-side line) counts as "whole hunk" (`pickableLinesOf`, `effectiveLineOf` in `split.ts`; the picker and the submit read the same
value, so what is shown is what is saved). A removed-only change is commented through its hunk. A note
made earlier on a removed line still draws, under its run. Notes draw full width under the *end of the
change run* their line belongs to, not under the line itself, so a note never splits a pair: the cut
moves to the run's end (`runEndOf`), notes on one run share it, and the segments' rows concatenate to
the hunk's rows. Hunk-wide, addressed and relocated notes, and the compose box, draw after the hunk
as in unified.

## The file list navigates the stream

Pressing a file's row (`select(path)`) scrolls the stream so that file's title is as near the
top as the stream's remaining length allows (a file with enough content below it lands exactly at
the top; one near the end of a short stream scrolls as far as the stream goes and no further, per `clampTop` in `plugins/raven/hooks/views/diff/layout.ts`) and marks the pressed file's row with
`❯`, without reloading anything. Scrolling the stream instead, by wheel or by the file list's `↑`/`↓`
Buttons (below), moves the list's `❯` to whichever file's title is now at the top of the body
(`fileAtRow` in `plugins/raven/hooks/views/diff/blocks.ts`): a press sets where the stream scrolls
to; a scroll sets which file the list marks. `↑`/`↓` step the selection to the adjacent file in
list order and scroll to it the same way pressing its row does.

## Live feed

A file an `Edit`/`Write`/`NotebookEdit`/`MultiEdit` call changes during the current turn (from the
main loop or a subagent) draws a trailing `◉` in `COLORS.accent` in its file-list row, after its
`+adds`/`−dels` counts and stat bar (`plugins/raven/hooks/views/diff/file-list.tsx`); the same file
also draws its card's rail (or frame) and its change-map glyph in the accent colour, so the
live feed is visible from the file list, the map, or the stream itself. The mark clears once the
turn ends, on any main-loop turn-completion reason (an answer, an interrupt, or an error), not
only a clean answer.

**Follow:** while the person has not scrolled or pressed a file row this turn, a landed edit
scrolls its file's title into view once the refresh after it completes. A person's scroll or
file-list press (wheel, the file list's `↑`/`↓`, or pressing a file row) turns follow off until
the next turn; a programmatic jump (a `diff` directive naming a path) never does. Follow never
jumps while a comment's compose box is open: it keeps the pending target and tries again on the
next refresh rather than dropping it.

## Sources

A `Select` in the header (falling back to a row of plain buttons on a surface without `canPick`,
see [`settings-and-surfaces.md`](./settings-and-surfaces.md)) chooses what the working tree is
diffed against: `HEAD` (default), `session start`, `branch point`, or one `turn N: <prompt>` per
turn that edited files, newest first. `HEAD`, `session start`, and `branch point` persist per
repository in `$.store`, keyed by the repository's toplevel path, so the choice survives a session
restart; picking a turn does not persist.

`session start` is `HEAD` as it stood at this module instance's first successful refresh: a hot
reload of the mod resets it, since it lives only in memory. `branch point` is `HEAD`'s merge-base
with the repository's default branch, resolved as origin's `HEAD` symref, else `main`, else
`master`; the option is left off the picker entirely when none of those resolves
(`plugins/raven/hooks/git/base.ts`).

Picking a turn switches the file list and hunks to that turn's edited files instead of a git diff:
synthetic hunks built from the turn's `Edit`/`MultiEdit`/`Write`/`NotebookEdit` calls
(`plugins/raven/hooks/review/turns.ts`). This source is read-only (no comment boxes, no
stage/revert) and it replaces the file list entirely: a turn's files are the only ones shown, so
an untracked file never appears there. Each file's title is its own path, the same as for any
other source: the header's source picker is what names the turn, so the title itself only needs
to say which file. A turn source splits side by side like a git source, see
[Side-by-side](#side-by-side).

The file list itself is always built from `git status` against HEAD, regardless of the selected
source; only a file's hunks and add/del counts are read against that source. Selecting
`session start` or `branch point` changes what a listed file's hunks and counts show, but does not
add a file whose only difference from that older base is already committed at HEAD, since nothing
currently in the working tree differs from HEAD there. Untracked files, found the same way, show
against every git-based source: their hunks come from a diff against `/dev/null`, and their add
counts come from a per-file diff against `/dev/null` for up to 50 untracked files; past that limit
they show `+0` rather than spawn a git process per file
(`plugins/raven/hooks/git/load.ts`).

## Reading hunks

A refresh reads every tracked file's hunks in one process (`git diff -M <base>` against the whole
working tree, no pathspec) and splits the output per file by its `diff --git` sections
(`diffSectionsOf`, `loadAllHunks` in `plugins/raven/hooks/git/load.ts`); `-M` gives this read
rename detection too. Each untracked file is read on its own, `git diff --no-index` against
`/dev/null`, one process per file up to the same 50-file limit the file list's add counts use,
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
not it landed (a failed or interrupted shell command may still have written files) schedules a
single refresh, debounced 300ms, while the diff pane (or the Files view, which shares the debounce)
is open. A main-loop edit, one not made by a subagent, additionally evaluates whether to open the
diff pane, but only once per session: the first main-loop edit is the only one ever checked, so a
terminal too narrow on that first edit is never retried later even if it widens. That check is
gated on the `autoOpen` and `autoOpenColumns` settings; that gate and the rest of Raven's settings
are owned by [`settings-and-surfaces.md`](./settings-and-surfaces.md). On the first `/raven` or the
first main-loop edit, a one-time toast also suggests closing the built-in diff panel when it is
open (or its state can't be read) and checkpointing is on, since that panel would otherwise cover
Raven's dock, see [`settings-and-surfaces.md`](./settings-and-surfaces.md) for the exact conditions
checked.

## Keys

No control carries a letter hotkey. Pills on a `Client` surface are mouse-first (R42): every action is reachable by click; the keyboard reaches a strip after a click inside it (←/→ move a focus ring between its pills, ↑/↓ between its rows, Enter or space presses the focused one); and with the `keyboardControls` setting every control is a plain Button in the Tab ring again, as on a surface without a `Client`. The file
list's `↑`/`↓` Buttons carry `action="app:diffFileListUp"`/`"app:diffFileListDown"`, so they answer
the person's own chords for the built-in diff list (ctrl+↑/↓ by default) as well as a click. A
file's note chip, inline after its title, is the ` ✎ note ` pill; a hunk's, on its label row beside
the stage and revert pills, is the ` ✎ note ` pill; the title's shrinks to its bare icon (` ✎ `)
under `chipsFit` when the row is too narrow for every chip's words, the title's path giving way
first; the label row's pills shrink to bare icons the same way. The header's [split
chip](#side-by-side) and the rest of the header chips follow `chipsLayout`'s priority order
(see [Header](#header)). Submitting or cancelling a comment returns the
keyboard to that anchor's note chip, so Esc/Enter flow stays inside the pane rather than jumping
to the composer.

## Stage and revert one hunk

Each hunk in a non-read-only source carries **pills** on its label row, two columns after the label,, drawn as one
`Client` strip (`hooks/ui/strip.tsx`; [mod-api](./mod-api.md#client-and-uimessage)): ` ✎ note ` (when
the surface has `canType` and the hunk isn't being composed), then ` ✓ stage `, then ` ↺ revert `:
coloured text on a tinted background, no brackets, the background lighting under the pointer; icons
only (` ✎ `, ` ✓ `, ` ↺ `) once the row is too narrow for every pill's words. A left click posts the
pill's id, which the press registry maps to the same handler a `Button` would have run. On a surface
without `canClient` the same labels draw as `plain` Buttons. Before either runs, Raven re-reads that one file's current hunks and requires an exact
header-and-text match against the hunk the button was drawn for. A mismatch (the working tree
moved since the last render) toasts "The hunk changed. Refreshed, try again", refreshes the
whole stream with the current hunks, and applies nothing.

`stage` runs `git apply --cached --recount` against a patch built for that one hunk
(`plugins/raven/hooks/git/patch.ts`); once it succeeds the pill reads ` ✓ staged ` (` ✓ ` in icons
mode) in the `on` kind (success colour) and stops responding until a refresh drops the mark, which
happens once the hunk's header no longer appears in a fresh load. `revert` runs `git apply -R
--recount` on the same patch, restoring the working tree; the first press turns the pill into the
`armed` kind (` ↺ sure? ` on a filled error background, keeping its words even when the other pills
shrink to icons) and any other action anywhere in the pane (including a background refresh or a
scroll, not only a deliberate one) resets that arming, so a second, immediately-following press is
what applies it. Reverting an added or untracked file's
one hunk deletes the file outright: its forward patch is "create this file", so `git apply -R`
undoes that. Either way, success re-reads and re-renders every file's hunks, the same refresh
[above](#reading-hunks), not just the one file the hunk belonged to.

The hunk applied is always the one computed against the pane's *selected* source, not necessarily
HEAD: this is consistent when the source is `HEAD`, since the index `--cached` targets and the
working tree `-R` targets are HEAD-relative too, but choosing `session start` or `branch point`
still offers stage/revert on hunks diffed against that older commit while the index and working
tree it applies to remain what they are regardless of the picker.

A renamed file's patch carries synthetic `rename from`/`rename to` header lines alongside its old
and new paths; without them `git apply` reads the hunk as a diff of the file against itself. Its
hunks come from a rename-detecting diff either way: the stale-hunk re-check above reads that one
file with its own `git diff -M` against both paths, and the stream's own hunks come from the same
`-M` flag on the one combined read [above](#reading-hunks), so a rename carrying a content edit
shows the edit rather than the whole file as newly added in both places.

## Long hunks

A hunk loaded from git is bounded by row count, not character length: it is windowed into whatever
rows of it the current scroll position exposes. That bounds how many lines reach the `Code`
element, not their total length, so a screen's worth of unusually long lines can still exceed the
engine's per-element character cap with nothing here to truncate it. A turn source's synthetic
hunks have no natural boundary to window against (a `Write` of a whole file becomes one hunk with
no `@@` breaks to page through), so those alone are clamped at construction time to that same cap
(see [`mod-api.md`](./mod-api.md)), cut at a line boundary with a trailing "… (N more lines)" marker
(`plugins/raven/hooks/git/hunks.ts`, `clampHunk`, called from
`plugins/raven/hooks/review/turns.ts`). An oversized git hunk has no equivalent safeguard in unified view; a [side-by-side](#side-by-side)
hunk keeps each side's `Code`
under the cap.

## Icons

Each file row carries a Nerd Font glyph chosen by extension or filename
(`plugins/raven/hooks/views/icons.ts`) and a colored one-letter status mark: `A`/`M`/`D`/`R`/`U`
for added, modified, deleted, renamed, and untracked. A renamed file's row label reads
`old → new`.

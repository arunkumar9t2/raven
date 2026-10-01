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

A markdown file or note is split by `markdown-chunks.ts` into pieces small enough for the engine's
`Markdown` element, which refuses to draw text over its character cap (`ELEMENT_TEXT_LIMIT`, the same
cap `Code` and `Text` carry — see [`mod-api.md`](./mod-api.md)). Cuts prefer a blank line outside a
code fence, so a code block never splits mid-block; a single block longer than the cap is still cut
between lines, with the fence closed before the cut and reopened after it. A file that is not markdown
renders as one `Code` element instead, truncated at the same cap with a "the rest of the file is not
shown" note when it overruns.

An image renders as an `Image` element sized to fit the pane's width, but only for `.png` — the one
format the surface reads straight from a file — and only when the surface's element table carries
`Image` at all; other image extensions (`.jpg`, `.gif`, `.webp`) and a surface without `Image` both
fall back to the image's path as dim text.

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
and leaving plan mode with a plan, or re-entering it, opens the plan.
[`settings-and-surfaces.md`](./settings-and-surfaces.md) owns that setting's exact matching rule.
Configurable extras aside, these watched paths are the view's own built-in behavior, not something
another doc owns.

## Files view

The Files view (`plugins/raven/hooks/views/tree-view.tsx`, pane id `raven-files`, subcommand
`files`) lists the repository's tracked and untracked files from `git ls-files --cached --others
--exclude-standard`, capped at 5 000 paths; a longer listing shows a "capped at 5000 files" row
instead of the remainder (`plugins/raven/hooks/views/tree/tree.ts`).

The listing is a dir/file tree, directories sorted before files at each level, both sorted by name.
A directory row carries an expand arrow and, dimmed, a count of its changed descendants; a directory
containing a change starts expanded, every other directory starts collapsed, and the person's manual
expand/collapse choices persist across refreshes once they have expanded anything. A file row
carries its type icon and a change-status mark — added, modified, deleted, renamed, untracked —
computed against `HEAD`. Clicking a directory row toggles it; clicking a file row opens it in the
Doc view.

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

The view draws a progress header ("N/M done") and one row per task: `☐` pending, `◐` in_progress
(showing the task's `activeForm` when set, else its subject), `☑` completed and dimmed.

The view opens itself as a background tab the first time the task list becomes non-empty, but only
when no Raven pane is open yet — it never steals focus from a pane already open, and never reopens
itself once dismissed.

## Status band

Above the prompt (`AbovePrompt`), one row reads `raven · N comments pending · plan updated`
(`plugins/raven/hooks/views/band.tsx`, state in `plugins/raven/hooks/core/band-state.ts`). It draws
only when something is pending — pending review comments, or a doc/plan shown since the pane was
last visible — and only while no Raven pane is currently visible, whether the dock is closed or a
Raven pane is open behind another tab. It never draws while a survey holds the band, and sizes
itself to the surface's `bodyColumns` with `wrap="truncate-end"`.

A doc counts as unseen from the moment it is shown (or reloaded, for a doc the person has opened
here before) until the Doc pane is actually drawn again; the count and the unseen flag both
invalidate the band's render so it updates without a keystroke. The row's plain `open` button opens
the diff when comments are pending, else the doc; `send`, drawn only while comments are pending,
submits the review exactly as `/raven send` does.

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

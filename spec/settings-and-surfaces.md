# Settings and surfaces

Two concerns sit outside any one view: how the person configures Raven's automatic behavior, and how
Raven draws on whatever surface is hosting it — a full terminal element table, or a thinner one with
pieces missing. Both are decided once, early, and read by every view rather than owned by any of
them.

## Settings

`.claude-plugin/plugin.json` declares three `userConfig` fields, which `/config` lists for this
plugin and which `register`'s `options` argument carries at `session.start`:

| Field | Type | Default | Does |
| --- | --- | --- | --- |
| `watchedPaths` | string | `''` | Comma-separated path fragments; a landed edit under one opens its `.md` in the Doc view. |
| `autoOpen` | boolean | `true` | Opens the diff on the main loop's first edit of the session. |
| `autoOpenColumns` | number | `144` | Skips that auto-open below this terminal width, in columns. |

`plugins/raven/hooks/core/settings.ts` parses `options` defensively into a `RavenSettings`: a field
of the wrong type — a non-string `watchedPaths`, a non-boolean `autoOpen`, a non-numeric or
non-positive `autoOpenColumns` — falls back to its default rather than raising. `watchedPaths` splits
on commas, trims each fragment, and drops empty ones; an all-empty result also falls back to the
default (no extra watched fragments). `register.ts` builds this parsed settings object once and
passes it into `createRaven`, which threads it to the trigger registry described below and to the
auto-open check.

### `watchedPaths` matching

A fragment matches a landed edit's path by contiguous path segments, not substring containment: the
fragment and the path are each split on `/`, and the fragment's segments must appear as a contiguous
run among the path's segments (`containsFragment` in `plugins/raven/hooks/core/triggers.ts`). This is
why a single-segment fragment like `docs` never matches a path segment like `docsystem`, while a
multi-segment fragment like `notes/drafts` matches across exactly those two adjacent segments. This
check runs alongside, not instead of, the always-on built-in watched paths, which
[`views.md`](./views.md) documents as the Doc view's own default behavior.

### Reaching `register`

`options` arrives as `register`'s second parameter, straight from the engine; nothing upstream of
`settingsOf` validates it, which is why every field is parsed defensively rather than trusted. The
parsed `RavenSettings` is immutable for the session: a change to `/config` takes effect on the next
session, not the current one, since `createRaven` and its triggers are built once at `session.start`.

## Surfaces

Raven draws with a fixed element set — `Box`, `Text`, `Button`, `Code`, `Markdown` — that every
surface carries, plus three elements — `Image`, `Input`, `Select` — that only some surfaces do.
`plugins/raven/hooks/core/view.ts` types the full set as `Ui`, all eight elements typed present,
never `| undefined` — because the engine completes every surface's element table to a constructor
for every element name, one a surface doesn't actually carry just draws a fragment there, it is
never literally `undefined`. So **presence can never tell a real control from a completed
fragment**, and the type can't be made to say otherwise: no view ever writes `ui.Input`,
`ui.Select`, `ui.Image`, or any `X ? … : …`/`!X` branch keyed on one of those three; destructuring
them in order to draw is fine, but which branch to take is decided below, never by checking the
element itself.

The one source of truth is a fixed, per-surface table (`CAPABILITIES_BY_SURFACE` in
`core/view.ts`, mirroring the engine's own `Elements` type) that `capabilitiesOf` reads by surface
name:

| Surface | `Input`/`Select` (`canType`/`canPick`) | `Image` (`canShowImage`) |
| --- | --- | --- |
| `terminal` | yes | yes |
| `desktop` | yes | no |
| `vscode` | yes | no |
| `mobile` | no | no |

`register.ts`'s `kitOf` computes this once per `ui.render` event, off `e.surface`, and puts it on
`Kit` as `kit.capabilities` — the only thing any view reads to decide whether it can type, pick, or
show an image; a view never calls `capabilitiesOf` itself. A surface absent from the table (one
the engine has added since) reads as all-false rather than throwing, so a view still renders on it,
just with no typed, picking, or imaging controls.

A view checks a capability before drawing the element that needs it, and degrades rather than
crashing or drawing nothing useful:

- Without `canType`, neither the diff pane nor the Doc view draws a `[ ✎ note ]` chip anywhere —
  not on a diff file's heading, a hunk's toolbar row, or a doc section's own row — and no compose
  box opens anywhere; a hunk's `[ ✓ stage ]` and `[ ↺ revert ]` chips still draw and work, since
  staging and reverting need no typing. An anchor's existing notes still render normally either
  way, on either view.
- Without `canPick`, a picker falls back to a row of plain buttons over the same options
  (`plugins/raven/hooks/views/select-buttons.tsx`) — the diff's source picker (HEAD, session start,
  branch point; a turn source has no name short enough for a button and is left off), and the Doc
  view's history picker (its 3 most recent documents instead of the full list). A hunk's compose box
  without `canPick` also drops its line picker, so every comment on that surface anchors to the
  whole hunk rather than one line.
- Without `canShowImage`, or for any non-PNG image format even with it, the Doc view shows the
  image's path as dim text instead of attempting to render it.

`FULL_CAPABILITIES` in the same file is `terminal`'s row, every capability on — for a caller
outside a real render (a default in `blocksOf`'s options) that can assume the richest surface
rather than take one as an argument.

See [`diff-pane.md`](./diff-pane.md) and [`views.md`](./views.md) for how each view's own layout
reads these capabilities.

## The native built-in diff panel toast

Claude Code's own built-in diff panel — not a plugin pane, a feature of the engine itself — auto-opens
on the first checkpointed edit and takes the dock over Raven's panes when it does, since only one
docked panel shows at a time. Raven cannot close that panel itself, so instead it warns once per
module instance: on the first `/raven` command or the first main-loop edit
(`warnDiffPanelOnce` in `plugins/raven/hooks/core/raven.ts`), it checks two conditions and toasts
"Close the built-in diff panel (✕) once so Raven can dock beside the transcript" when both hold.

The two conditions, checked in `plugins/raven/hooks/core/checkpointing.ts`: the built-in diff sidebar
is set open in `~/.claude.json`'s `diffSidebarOpen` (or that value is unreadable, which is read as
"assume open" rather than silently skipping the warning), and the session is checkpointing edits —
`fileCheckpointingEnabled` is not explicitly `false` in settings and
`CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING` is not one of `1`/`true`/`yes`/`on`. The check never throws;
a failure to read either source is logged and treated as "don't warn" rather than blocking the
command or edit that triggered it.

## Debug logging

Raven has no visible log of its own; failures that should not interrupt the person's session go to
the engine's debug log instead, through `host.debug`, which calls `$.ui.log(text, { to: 'debug' })`.
Every call site follows the same shape: a `try`/`catch` (or a `.catch`) around a non-critical
operation — resolving the repository for the review, forking to resolve sent comments, focusing a
pane, refreshing a reopened view, checking the diff panel condition, reacting to a finished tool call
— that logs the error and continues rather than surfacing it to the person or the model. This keeps
one bad refresh or one failed fork from cascading into a broken pane; the person sees a pane that
simply didn't update, and the debug log carries the reason.

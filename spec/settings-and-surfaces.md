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
surface is assumed to carry, plus three optional elements — `Image`, `Input`, `Select` — that a
surface's own element table may omit. `plugins/raven/hooks/core/view.ts` types this as `Ui`, and
`capabilitiesOf` reads a surface's actual table into `{ canType, canPick }` by checking whether
`Input` and `Select` are present, rather than assuming a fixed feature set per surface kind.

A view checks a capability before drawing the element that needs it, and degrades rather than
crashing or drawing nothing useful:

- Without `Input`, a comment control draws no compose box and no submit button at all; an anchor's
  existing notes still render normally.
- Without `Select`, a picker falls back to a row of plain buttons over the same options
  (`plugins/raven/hooks/views/select-buttons.tsx`) — the diff's source picker (HEAD, session start,
  branch point; a turn source has no name short enough for a button and is left off), and the Doc
  view's history picker (its 3 most recent documents instead of the full list). A hunk's compose box
  without `Select` also drops its line picker, so every comment on that surface anchors to the whole
  hunk rather than one line.
- Without `Image`, or for any non-PNG image format, the Doc view shows the image's path as dim text
  instead of attempting to render it.

`FULL_CAPABILITIES` in the same file is the fixed `{ canType: true, canPick: true }` a caller can
assume when it already knows the surface carries everything — the terminal surface Raven ships
against does.

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

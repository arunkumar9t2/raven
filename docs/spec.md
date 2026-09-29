# Raven — specification

Raven is a live preview surface for Claude Code: a pane docked beside the transcript that shows the
session's diff, the plans and docs Claude writes, and anything Claude chooses to put there. The person
can comment on the diff; those comments reach Claude on the next prompt.

It ships as one Claude Code plugin with three layers:

| Layer | Lives in | Runs | Owns |
| --- | --- | --- | --- |
| **Mod** (deterministic) | `plugins/raven/hooks/` | inside Claude Code, as function hooks | every pixel, every reaction to an engine event, in-session state, prompt injection, the `show` tool |
| **CLI** (agentic fallback) | `plugins/raven/cli/` → `plugins/raven/bin/raven` | as a process Claude starts through Bash | argument parsing, path resolution against the shell's cwd, file validation, the directive it prints |
| **Skill** (agentic guidance) | `plugins/raven/skills/preview/` | in the model's context, on demand | when and how Claude should reach for the `show` tool, or the CLI when it is absent |

## The boundary

The mod runs in a sandbox with no Node, no process and no inbound channel. Nothing outside the
engine can call into it. Claude's primary entry is the native `mcp__<plugin>__show` tool the mod
registers at `session.start` and serves directly, with no process in between. The CLI remains for
humans at a shell and for sessions without function hooks, where no tool is there to call: it never
talks to the mod directly, and instead prints one **directive** line the mod reads from the Bash
tool's result as that call returns.

```
Claude ──tool call──▶ mcp__raven__show {op:"show", path:"docs/plan.md"}      (function hooks on)
                                                           │
                        mod: on('tool.call', {tool: /show$/}) ◀┘  resolves path, acts, answers directly

Claude ──Bash──▶ raven show docs/plan.md ──stdout──▶ ::raven::{"op":"show","path":"/abs/docs/plan.md"}
                                                           │                      (function hooks off,
                        mod: on('tool.call', {tool:'Bash'}) ◀┘  parses, acts, rewrites the result text    or the tool unlisted)
```

- The CLI is stateless and must stay useful when the mod is absent (function hooks off): after the
  directive it prints a plain human/model-readable fallback line. The mod swaps the directive and
  fallback lines for a short acknowledgement and keeps anything else the command printed.
- The CLI lives inside the plugin (`plugins/raven/cli/`) because an install copies only the plugin
  directory; `bin/raven` runs the compiled `dist/raven` when present, else the source under Bun.
- Anything that needs the shell's working directory, globbing, or validation belongs in the CLI; the
  mod does not know where Bash's `cd` left it. The tool is the exception: its `path` resolves against
  the session's own cwd (`$.session.cwd()`), since no shell sits between the model and the mod there.
- Anything that needs the screen, engine events or session state belongs in the mod.

## Directive contract

The `show` tool's input and a directive line share the same shape (`op`, `path`, `markdown`, `title`);
one line per directive, `::raven::` followed by compact JSON. Unknown ops are ignored by the mod.

| op | fields | mod action |
| --- | --- | --- |
| `show` | `path` (absolute for a directive; resolved against the session cwd for the tool), `title?` | open the doc view on that file (markdown rendered, anything else highlighted by extension) |
| `note` | `markdown`, `title?` | open the doc view on inline markdown Claude composed |
| `diff` | `path?` (as above) | open the diff view, selecting `path` when given |
| `comments` | — | answer with the pending review comments as the tool result text |

## Views

The pane is a host for **views**. A view is one engine pane (`id`, `title`); the engine shows one at a
time and tabs the rest. A view declares its pane, the `/raven <subcommand>` that toggles it, and
`render(kit)`, which draws from its own model. `/raven <subcommand>` brings a background tab forward
and hides a shown one; `/raven` alone means `/raven diff`.

**Triggers** map engine events to view actions and are listed in one registry, so adding a view or a
trigger is one entry, not a change to `register`.

### Diff view (`raven`)

- Compares the working tree (tracked changes and untracked files) against a chosen source. A
  `Select` in the header offers `HEAD` (default), `session start` (`HEAD` as it stood at this
  module instance's first successful load), `branch point` (`HEAD`'s merge-base with the default
  branch — origin's `HEAD` symref, else `main`, else `master`; hidden when none resolves), and one
  `turn N — <prompt>` option per turn with edits (newest first, from the session transcript). `HEAD`,
  `session start` and `branch point` persist per repository across sessions; picking a turn does
  not. Untracked files show against every source.
- Picking a turn switches the file list and hunks to that turn's edited files (synthetic hunks
  built from its `Edit`/`MultiEdit`/`Write`/`NotebookEdit` calls) instead of a git diff; this view
  is read-only — no comment boxes, no stage/revert — and the selected file's title row reads
  "Turn N" instead of its path.
- One row per file: status glyph, file-type icon, path, `+adds −dels`. Clicking a row selects it.
- The selected file's hunks, each drawn with `Code format="diff"`, one element per hunk (the engine
  caps a `Code` source at 10 000 characters; a longer hunk is truncated with a marker).
- Refreshes, debounced, after `Edit`/`Write`/`NotebookEdit`/`Bash` calls land; opens on the first
  main-loop edit when the terminal docks panes.
- On the first `/raven` or first main-loop edit, a one-time toast asks to close the built-in diff
  panel when it would otherwise cover Raven's dock (open, or unreadable, and checkpointing is on).
- Hotkeys, live while the pane holds the keyboard: `j`/`k` select the next/previous file (also
  plain `↓`/`↑` buttons in the header), `c` opens a comment on the selected file, `s` sends the
  pending review, `r` refreshes. Submitting or cancelling a comment returns the keyboard to that
  anchor's comment button, so Esc/Enter flow stays in the pane.
- Each hunk carries a `stage`/`revert` row under its comment box. `stage` runs
  `git apply --cached` on that hunk's own patch; once it succeeds the button reads `staged ✓` and
  stops responding until a refresh changes the hunk. `revert` runs `git apply -R` on it, restoring
  the working tree; the first press relabels it "revert? (again)" and any other action in the pane
  resets that, so a second, deliberate press is what applies it. The diff compares the working
  tree against `HEAD`, so a staged hunk still shows here — `staged ✓` is the only sign it moved to
  the index.

### Doc view (`raven-doc`)

- Renders one document: a markdown file, an image (`.png`, `.jpg`/`.jpeg`, `.gif`, `.webp`) as an
  `Image` element sized to fit the pane's width, a non-markdown file (highlighted by its path), or
  inline markdown from a `note` directive. A surface without `Image` shows the image's path as dim
  text instead.
- Keeps a short history of shown documents, selectable from the pane.
- Opens itself when Claude writes or edits a markdown file under a watched plan path:
  `docs/superpowers/plans/`, `docs/superpowers/specs/`, `.superpowers/`, `~/.claude/plans/`.
- A relative or `file:` link in a shown file's markdown, resolved against the file's own directory,
  opens the target in the Doc view; an `http(s):` link keeps the surface's own behaviour.

### Files view (`raven-files`)

- The repository's tracked and untracked files (`git ls-files --cached --others
  --exclude-standard`), capped at 5 000 paths; a longer list shows a "capped" notice instead of
  the rest.
- A dir/file tree: dirs sorted before files, each sorted by name; a dir row carries an expand
  arrow and, dimmed, its count of changed descendants. Dirs containing a change start expanded,
  every other dir collapsed.
- A file row carries its type icon and a change-status mark (added/modified/deleted/renamed/
  untracked) against `HEAD`. Clicking a dir toggles it; clicking a file opens it in the Doc view.
- Refreshes on the same debounce as the diff view, while its pane is open.

### Tasks view (`raven-tasks`)

- A checklist built from `TodoWrite`, `TaskCreate` and `TaskUpdate` calls: a progress header
  ("N/M done"), then one row per task — `☐` pending, `◐` in_progress (showing its `activeForm`),
  `☑` completed (dimmed).
- Opens itself, as a background tab, the first time a task list becomes non-empty, but only if no
  Raven pane is open yet; it never steals focus.

## Review comments

- The selected file and each of its hunks carry a comment control. On a hunk, composing shows a
  line picker — "whole hunk" plus one option per changed line (`Lnn +`/`-` its text, truncated to
  the pane) — alongside the text input; the chosen line rides with the comment as
  `{ path, hunk header?, line?: { number, side, text }, text }`. A line-anchored note shows `Lnn`
  before its text.
- A comment anchored to a hunk header no longer among the file's current hunks (Claude edited past
  it) renders in an "Outdated" group after the hunks, under a dim title row; it stays removable and
  sendable.
- A comment's status is `pending` (normal), `sent` (dim, `⧗`, once it has ridden a prompt),
  `addressed` (collapsed with every other addressed comment at its anchor into one dim
  "✓ N addressed" row), or `open` (`↻`, with a plain `resend` button) when a turn finished without
  naming it. The header's send button counts pending comments.
- The next prompt the person sends (typed, or through Remote Control) carries every pending comment
  as hidden context, formatted as a review, and marks them sent rather than clearing them. The
  header's **send N** button (or `/raven send`) instead submits the review as a
  visible prompt.
- The header's plain **edit & send** button, shown alongside send whenever comments are pending,
  marks them sent and fills the prompt box with the same review text (`$.prompt.fill`, replacing
  the draft) so the person can edit it before pressing Enter themselves. When the box refuses the
  fill (no composer in this session, or a dialog holds the keyboard), the comments return to
  pending and a toast names the reason.
- Once the main loop's turn finishes answering with comments sent, Raven forks the conversation
  once with a prompt listing each sent comment (`[id] path Lnn: text`) asking for a JSON array of
  the ids it addressed; a named id becomes `addressed`, every other sent comment becomes `open`. A
  null or unparseable reply leaves them `sent`. Only one fork runs per sent batch, and an agent's
  own turn (not the main loop's) never forks.
- `raven comments` returns the pending comments to Claude as the tool result, which delivers them.
- Comments live in memory for the session and in `$.store` keyed by repository, never in the working
  tree.
- Raven's status line (`$.ui.status`) reads "N review comments pending" whenever the pending
  count changes, and clears once it reaches zero.
- The header's plain `clear` button asks for confirmation: the first press relabels it
  "clear all? (again)"; the second calls `review.clear()`, dropping every comment regardless of
  status. Any other action in the pane resets the unconfirmed state.

## Naming

The product name is a working title. Every name derived from it — command, pane ids, directive
prefix, store keys, binary — comes from `hooks/names.ts`, which the CLI imports at build time.

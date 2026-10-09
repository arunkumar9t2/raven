# Raven

A live preview pane for Claude Code. Raven docks beside the transcript and shows:

- **Diff** — the working tree against `HEAD`, coloured by Claude Code's own theme keys: a change
  map sketches the shape of every file's edits at a glance, each file's section carries a
  status-coloured left rail, and a file Claude is editing this turn lights up in the accent colour
  across the file list, the map and its rail. One scrolling stream of every changed file's icon
  and syntax-highlighted hunks, each hunk labelled by its function context, refreshed as Claude
  edits and runs commands. Comment on a file or a hunk; your comments ride the next prompt as a
  review, or go at once with the primary **send** chip.
- **Review tools** — the header and file list stay pinned while the stream scrolls, and the list
  stays in sync with whichever file is at the top; every control is a clickable pill that shrinks
  to an icon on a narrow pane (keyboard: after a click in its strip, or everywhere with
  `keyboardControls`); comments on a single diff line, shown as margin notes; after Claude replies, Raven checks which comments it
  addressed and marks them ✓; stage or revert one hunk; compare against HEAD, the session's start,
  the branch point, or one turn's edits.
- **Files** and **Tasks** — the repository tree with status-coloured change marks, and Claude's
  task list with a progress bar and state dots.
- **Status band** — pending comments and updated plans show above the prompt when the pane is closed.
- **Doc** — plans and specs rendered as Claude writes them (`docs/superpowers/`, `.superpowers/`,
  and plan mode's plan file, wherever plans are kept), plus anything Claude chooses to show with the
  `raven` CLI. Leaving or re-entering plan mode opens the plan (unless `autoOpen` is off). Comment on a section of a rendered
  markdown doc the same way you comment on the diff; the note rides with your next review.

Raven is a Claude Code *mod*: a plugin whose behaviour is a TypeScript function-hooks module running
inside Claude Code, paired with a Bun CLI and a skill so Claude can drive the pane itself.

## Requirements

- Claude Code 2.1.287+ (mods load by default there; no environment variable needed)
- The fullscreen layout — on by default outside tmux; under tmux (which defaults to the main
  screen) set `CLAUDE_CODE_NO_FLICKER=1` — and a terminal wide enough to dock: 110 columns once you
  open the pane yourself (`/raven`), 144 for it to open on its own (`autoOpenColumns`). Narrower
  than 110, the pane waits undrawn until you widen the terminal.
- A Nerd Font for file icons
- Bun on PATH for the `raven` CLI (every install runs it through Bun; nothing ships a prebuilt
  binary)
- The built-in diff panel closed: it takes the dock on the first edit and hides Raven. Close it once
  with its ✕ and Claude Code remembers. (`CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING=1` also stops it,
  at the cost of `/rewind`.)

## Install

From the marketplace (the repo is private, so this needs GitHub access from your Claude Code):

```
/plugin marketplace add arunkumar9t2/raven
/plugin install raven@raven
```

Then run `/reload-plugins` (or restart Claude Code).

Or run it straight from a checkout, without installing it:

```bash
bun install
claude --plugin-dir ./plugins/raven
```

`bun run build` additionally compiles the CLI to `plugins/raven/dist/raven`, which `bin/raven`
prefers when present; without it, `bin/raven` runs the TypeScript source through Bun directly — the
same thing a marketplace install does, since the compiled binary is gitignored and not published.

Or load this checkout live in every local session (keeps hot-reload on save):

```bash
bun run setup:local            # --remove to undo, --dry-run to preview
```

It adds this plugin folder to `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`'s `env` (and,
kept for backward compatibility with Claude Code older than 2.1.287,
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`), and allows `Bash(raven:*)`. With a chezmoi-managed settings
file, follow it with `chezmoi add ~/.claude/settings.json`.

Whichever way it's loaded: `/raven` (diff), `/raven doc`, `/raven files`, `/raven tasks`,
`/raven send`. To let Claude run the CLI without a permission prompt, allow `Bash(raven:*)`.

## CLI

Claude runs these through its Bash tool; the plugin's `bin/` is on PATH while it is enabled. To use
them in your own shell, add `plugins/raven/bin` to your PATH.

```
raven show <path> [--title T]     render a markdown file / show any file
raven note [--title T] [<md>|-]   render markdown (stdin when omitted)
raven diff [<path>]               open the diff, optionally at a file
raven open <pane>                 open a pane: diff, doc, files or tasks
raven comments                    print pending review comments
```

## Settings

`/config` lists four fields for this plugin:

| Field | Type | Default | Does |
| --- | --- | --- | --- |
| `watchedPaths` | string | `''` | Comma-separated path fragments; a landed edit under one (plus the built-in plan paths) opens its `.md` in the Doc view. |
| `autoOpen` | boolean | `true` | Opens panes nobody asked for: the diff on the main loop's first edit, a plan or watched doc as it is written, Tasks on the first task list. Off, a pane opens only when asked (`/raven`, the Files view, Claude's `raven` CLI). |
| `autoOpenColumns` | number | `144` | Skips those opens below this terminal width, in columns. |
| `keyboardControls` | boolean | `false` | Draws plain Tab-reachable buttons instead of clickable pills, so every control works from the keyboard. |

## Develop

See `CLAUDE.md`. `bun run check` runs everything; `bun run cc` drives a real session in tmux.

## License

Apache License 2.0 — see [LICENSE](./LICENSE).

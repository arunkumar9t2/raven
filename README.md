# Raven

A live preview pane for Claude Code. Raven docks beside the transcript and shows:

- **Diff** — the working tree against `HEAD`, file by file with icons and syntax-highlighted hunks,
  refreshed as Claude edits and runs commands. Comment on a file or a hunk; your comments ride the
  next prompt as a review, or go at once with **Send to Claude**.
- **Review tools** — the header and file list stay pinned while the hunks scroll; `j`/`k`/`c`/`s`/`r`
  keys; comments on a single diff line; after Claude replies, Raven checks which comments it
  addressed and marks them ✓; stage or revert one hunk; compare against HEAD, the session's start,
  the branch point, or one turn's edits.
- **Files** and **Tasks** — the repository tree with change marks, and Claude's task list.
- **Status band** — pending comments and updated plans show above the prompt when the pane is closed.
- **Doc** — plans and specs rendered as Claude writes them (`docs/superpowers/`, `.superpowers/`,
  and plan mode's plan file, wherever plans are kept), plus anything Claude chooses to show with the
  `raven` CLI. Leaving or re-entering plan mode opens the plan.

Raven is a Claude Code *mod*: a plugin whose behaviour is a TypeScript function-hooks module running
inside Claude Code, paired with a Bun CLI and a skill so Claude can drive the pane itself.

## Requirements

- Claude Code 2.1.259+ with function hooks enabled (early access): `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`
- The fullscreen layout (`CLAUDE_CODE_NO_FLICKER=1`) and a terminal at least 110 columns wide
- A Nerd Font for file icons
- Bun on PATH for the `raven` CLI (or a compiled `plugins/raven/dist/raven` from `bun run build`)
- The built-in diff panel closed: it takes the dock on the first edit and hides Raven. Close it once
  with its ✕ and Claude Code remembers. (`CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING=1` also stops it,
  at the cost of `/rewind`.)

## Try it

```bash
bun install && bun run build
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir ./plugins/raven
```

Or load it in every session, live from this checkout (saves hot-reload):

```bash
bun run setup:local            # --remove to undo, --dry-run to preview
```

It sets `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` and adds this plugin folder to
`CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`'s `env`, and allows `Bash(raven:*)`. With a
chezmoi-managed settings file, follow it with `chezmoi add ~/.claude/settings.json`.

Then `/raven` (diff), `/raven doc`, `/raven send`. To let Claude run the CLI without a permission
prompt, allow `Bash(raven:*)` in your settings.

## CLI

```
raven show <path> [--title T]     render a markdown file / show any file
raven note [--title T] [<md>|-]   render markdown (stdin when omitted)
raven diff [<path>]               open the diff, optionally at a file
raven comments                    print pending review comments
```

## Settings

`/config` lists three fields for this plugin:

| Field | Type | Default | Does |
| --- | --- | --- | --- |
| `watchedPaths` | string | `''` | Comma-separated path fragments; a landed edit under one (plus the built-in plan paths) opens its `.md` in the Doc view. |
| `autoOpen` | boolean | `true` | Opens the diff on the main loop's first edit of the session. |
| `autoOpenColumns` | number | `144` | Skips that auto-open below this terminal width, in columns. |

## Develop

See `CLAUDE.md`. `bun run check` runs everything; `scripts/cc.sh` drives a real session in tmux.
The project name is a working title: every derived name lives in `plugins/raven/hooks/names.ts`.

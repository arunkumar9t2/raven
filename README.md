# Raven

A live preview pane for Claude Code. Raven docks beside the transcript and shows:

- **Diff** — the working tree against `HEAD`, file by file with icons and syntax-highlighted hunks,
  refreshed as Claude edits and runs commands. Comment on a file or a hunk; your comments ride the
  next prompt as a review, or go at once with **Send to Claude**.
- **Doc** — plans and specs rendered as Claude writes them (`docs/superpowers/`, `.superpowers/`,
  `~/.claude/plans/`), plus anything Claude chooses to show with the `raven` CLI.

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

## Develop

See `CLAUDE.md`. `bun run check` runs everything; `scripts/cc.sh` drives a real session in tmux.
The project name is a working title: every derived name lives in `plugins/raven/hooks/names.ts`.

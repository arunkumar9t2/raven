# Raven

A diff pane that sits next to Claude Code. Watch Claude's edits land, leave a note on the line you
mean, and Claude reads it on its next turn.

![Claude Code on the left, Raven on the right: a note on a hunk, Claude fixes the line, the note is marked addressed](docs/media/raven-note.gif)

Claude finishes a turn with "I've updated the retry logic across the codebase", and you scroll up to
find out where. Then you describe the line you want changed in English ("the second change, the one
with the hours, no, the other one"). Raven is a side panel for that moment.

## What you get

<img src="docs/media/raven-grid.webp" alt="Raven's panes: the live diff, notes Claude has addressed, a rendered plan with a note, and the file tree with changes marked" width="640">

- **A live diff.** Every changed file in one scrolling view, with syntax highlighting, updated as
  Claude edits files and runs commands. The file Claude is working on right now is highlighted. In a
  wide pane the diff shows side by side, with the changed words highlighted.
- **Notes Claude reads.** Comment on a file, a hunk or a single line. Your notes go to Claude with
  your next prompt, or right away with **send**. After Claude replies, Raven marks the notes it
  addressed with ✓.
- **Stage and revert** a single hunk with a click.
- **Compare** against your last commit, the start of the session, the branch point, or one turn's
  edits.
- **Plans and docs, rendered.** Plans and specs show up formatted as Claude writes them, and Claude
  can show you any Markdown file on request. You can leave notes on their sections too. When
  Claude wants your sign-off on a doc, it asks: approve, or comment first. Leave your notes in the
  pane, reply, and they go along with it.
- **Files and Tasks.** Your repository tree with changed files marked, and Claude's task list with
  its progress.
- **Reminders above the prompt.** Pending notes and updated plans show there while the pane is
  closed.

## Requirements

- Claude Code 2.1.287 or later
- A terminal at least 110 columns wide
- [Bun](https://bun.sh) installed (Claude uses it to run Raven's command-line helper)
- A [Nerd Font](https://www.nerdfonts.com) Mono variant as your terminal font, for the icons
  (optional; without one, icons show as blank boxes)
- Under tmux, `CLAUDE_CODE_NO_FLICKER=1` set in your environment

## Install

In Claude Code:

```
/plugin marketplace add arunkumar9t2/raven
/plugin install raven@raven
```

Then run `/reload-plugins`, or restart Claude Code.

## Use

<img src="docs/media/raven-hero.webp" alt="Claude Code on the left and the Raven diff pane on the right, with a note marked addressed" width="640">

Type `/raven` to open the diff. Raven also opens on its own when Claude makes its first edit, writes
a plan, or starts a task list (see [Settings](#settings) to turn that off).

| Command | Does |
| --- | --- |
| `/raven` or `/raven diff` | opens the diff |
| `/raven doc` | opens the rendered plan or doc |
| `/raven files` | opens your repository tree |
| `/raven tasks` | opens Claude's task list |
| `/raven send` | sends your pending notes to Claude now |

Run a pane's command again to close it.

To leave a note, click **note** on a file or a hunk, pick a line if you want one, type, and press
Enter. To send notes without waiting for your next prompt, click **send**.

You can also ask Claude to show you things, like "show me the plan in raven". To let Claude do that
without asking for permission each time, add `Bash(raven:*)` to the allowed tools in your settings.

## Settings

Open `/config` and look for Raven:

| Setting | Default | What it does |
| --- | --- | --- |
| `autoOpen` | on | Lets Raven open panes by itself: the diff on Claude's first edit, a plan as Claude writes it, the task list when Claude starts one. Turn it off and panes open only when you (or Claude, when you ask) open them. |
| `autoOpenColumns` | `144` | Raven only opens by itself when the terminal is at least this many columns wide. |
| `watchedPaths` | empty | Extra folders, comma-separated, whose Markdown files open rendered as Claude writes them. Plan folders are watched already. |
| `keyboardControls` | off | Draws plain buttons you can reach with Tab, so every control works from the keyboard. |
| `cardStyle` | `bar` | How files, doc sections, the note box and tables are framed: `bar` (a coloured bar down the left), `none` (no marks, a rule under titles), `sharp` or `rounded` (a closed frame; tables become full grids). |
| `splitColumns` | `160` | The diff shows side by side when the pane is at least this many columns wide. The `split` / `unified` chip in the diff header overrides it, and Raven remembers the choice per repository. |
| `paneBackground` | empty | A colour painted behind every Raven pane so it matches your terminal, for example `#101315`. Takes `#rgb`, `#rrggbb`, `rgb(r, g, b)` or a theme colour name, which Claude Code resolves. Empty keeps Claude Code's own pane colour. |

Settings are read when a session starts, so a change applies to the next session.

Raven cannot read your terminal's background, so set `paneBackground` to the same colour, the
background in your terminal's theme or config.

## Troubleshooting

- **The pane doesn't appear.** Widen the terminal to at least 110 columns; the pane draws as soon as
  it fits. Under tmux, set `CLAUDE_CODE_NO_FLICKER=1`.
- **Claude Code's own diff panel covers Raven.** Close it once with its ✕; Claude Code remembers.
- **Raven keeps opening by itself.** Turn off `autoOpen` in `/config`.
- **Icons look like boxes.** Switch your terminal to a Nerd Font.
- **Icons touch or overlap the text after them.** Your terminal draws the icons wider than a cell. Set
  the terminal font itself to a patched Nerd Font Mono (for example `IosevkaTerm Nerd Font Mono` or
  `JetBrainsMono Nerd Font Mono`). A separate symbols font as a fallback is not enough in terminals
  such as Alacritty, which draw a fallback glyph at its own width.

## Contributing

Raven is a Claude Code plugin written in TypeScript. To work on it:

```bash
bun install
bun run setup:local    # load this checkout in every local Claude Code session (--remove to undo)
bun run check          # typecheck, lint, tests and plugin validation
```

`claude --plugin-dir ./plugins/raven` loads it for a single session instead. The design lives in
[`spec/`](./spec/README.md), and [`CLAUDE.md`](./CLAUDE.md) covers the layout and workflow.

## License

Apache License 2.0. See [LICENSE](./LICENSE).

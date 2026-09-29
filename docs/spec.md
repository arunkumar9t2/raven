# Raven — specification

Raven is a live preview surface for Claude Code: a pane docked beside the transcript that shows the
session's diff, the plans and docs Claude writes, and anything Claude chooses to put there. The person
can comment on the diff; those comments reach Claude on the next prompt.

It ships as one Claude Code plugin with three layers:

| Layer | Lives in | Runs | Owns |
| --- | --- | --- | --- |
| **Mod** (deterministic) | `plugins/raven/hooks/` | inside Claude Code, as function hooks | every pixel, every reaction to an engine event, in-session state, prompt injection |
| **CLI** (agentic entry) | `cli/` → `plugins/raven/bin/raven` | as a process Claude starts through Bash | argument parsing, path resolution against the shell's cwd, file validation, the directive it prints |
| **Skill** (agentic guidance) | `plugins/raven/skills/raven/` | in the model's context, on demand | when and how Claude should reach for the CLI |

## The boundary

The mod runs in a sandbox with no Node, no process and no inbound channel. Nothing outside the
engine can call into it. The CLI therefore never talks to the mod directly: it prints one
**directive** line, and the mod reads it from the Bash tool's result as that call returns.

```
Claude ──Bash──▶ raven show docs/plan.md ──stdout──▶ ::raven::{"op":"show","path":"/abs/docs/plan.md"}
                                                           │
                        mod: on('tool.call', {tool:'Bash'}) ◀┘  parses, acts, rewrites the result text
```

- The CLI is stateless and must stay useful when the mod is absent (function hooks off): after the
  directive it prints a plain human/model-readable fallback. The mod replaces the whole result text
  with a short acknowledgement, so the model never reads the fallback when the pane is live.
- Anything that needs the shell's working directory, globbing, or validation belongs in the CLI; the
  mod does not know where Bash's `cd` left it.
- Anything that needs the screen, engine events or session state belongs in the mod.

## Directive contract

One line per directive, `::raven::` followed by compact JSON. Unknown ops are ignored by the mod.

| op | fields | mod action |
| --- | --- | --- |
| `show` | `path` (absolute), `title?` | open the doc view on that file (markdown rendered, anything else highlighted by extension) |
| `note` | `markdown`, `title?` | open the doc view on inline markdown Claude composed |
| `diff` | `path?` (absolute) | open the diff view, selecting `path` when given |
| `comments` | — | answer with the pending review comments as the tool result text |

## Views

The pane is a host for **views**. A view is one engine pane (`id`, `title`); the engine shows one at a
time and tabs the rest. A view declares:

- `render(kit)` — draw from its own model;
- `refresh(host)` — optional, recompute its model from the world;
- how it is reached: a directive op, a trigger, or `/raven`.

**Triggers** map engine events to view actions and are listed in one registry, so adding a view or a
trigger is one entry, not a change to `register`.

### Diff view (`raven`)

- Compares the working tree (tracked changes and untracked files) against `HEAD`.
- One row per file: status glyph, file-type icon, path, `+adds −dels`. Clicking a row selects it.
- The selected file's hunks, each drawn with `Code format="diff"`, one element per hunk (the engine
  caps a `Code` source at 10 000 characters; a longer hunk is truncated with a marker).
- Refreshes, debounced, after `Edit`/`Write`/`NotebookEdit`/`Bash` calls land; opens on the first
  main-loop edit when the terminal docks panes.

### Doc view (`raven-doc`)

- Renders one document: a markdown file, a non-markdown file (highlighted by its path), or inline
  markdown from a `note` directive or `ExitPlanMode`'s plan.
- Keeps a short history of shown documents, selectable from the pane.
- Opens itself when Claude writes or edits a markdown file under a watched plan path:
  `docs/superpowers/plans/`, `docs/superpowers/specs/`, `.superpowers/`, `~/.claude/plans/`.

## Review comments

- Each hunk and each file row carries a comment control; submitting its input records a comment
  `{ path, hunk header?, text }`.
- Pending comments are listed at the foot of the diff view, each removable.
- On the next `prompt.submit` every pending comment rides the prompt as hidden context, formatted as a
  review, and is marked sent. A **Send review** button submits a prompt carrying them at once.
- `raven comments` returns the pending comments to Claude on demand.
- Comments live in memory for the session and in `$.store` keyed by repository, never in the working
  tree.

## Naming

The product name is a working title. Every name derived from it — command, pane ids, directive
prefix, store keys, binary — comes from `hooks/names.ts`, which the CLI imports at build time.

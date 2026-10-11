# The agentic layer

Raven's pane reacts on its own to edits, shell calls and watched paths ([`views.md`](./views.md),
[`diff-pane.md`](./diff-pane.md)), but some of what belongs in the pane is only in Claude's head: a plan it just
finished, a file it wants the person to look at, a summary that reads better rendered than pasted
into chat. The agentic layer is how Claude reaches for the pane on purpose (through a native tool
when the engine offers one, through a CLI otherwise) without either path needing to know which of
the two is live.

It is also how Claude learns what the pane already holds, so it can hand a doc to the person for
review there instead of in the transcript. The trigger is never one workflow or one folder: whenever
Claude produces something the person should read or decide on (a plan, spec, design, report or any
other doc), either Raven opens it (a watched path or plan mode) and tells Claude so, or Claude shows
it.

## The `show` tool

At `session.start`, `plugins/raven/hooks/register.ts` registers a tool named `show` through
`$.tool.register`; the model calls it as `mcp__<plugin>__show`, where `<plugin>` is whatever name
this plugin was loaded under (`$.plugin.name`, not a hardcoded `raven`, since a directory-loaded copy
can carry another name). Its input schema takes an `op` (`show`, `note`, `diff`, `comments` or `open`) and,
depending on `op`, `path`, `markdown`, `title` and `pane`. The engine answers the tool call directly: no
process sits in between, and the same handler that parses a CLI-printed directive parses the tool's
input (`directiveOf` in `plugins/raven/hooks/core/directive.ts`).

A `path` given to the tool resolves against the session's own working directory
(`$.session.cwd()`), not a shell's, because no shell stands between the model and the mod here;
this is the one point where the tool's path resolution differs from a directive parsed off Bash
output. The result text confirms what happened: "Shown in the Raven pane: `<what>`." when the pane
opened, or a message that it could not dock the pane at all (the terminal too narrow) leaving nothing
shown.

## What Claude is told

The model learns about the pane without the preview skill being loaded. Three surfaces sit in the
prompt from the first turn, and a fourth arrives on the tool result of an edit that opened a pane:

- **The tool itself.** A `tool.describe` hook answers `isDeferred: false` for Raven's own `show`
  tool, so its schema and description sit in the prompt's tool list rather than behind ToolSearch.
  The description (`TOOL_DESCRIPTION` in `register.ts`) is kept short because it is always loaded:
  it names what to show and when, and says that a doc which opened by itself is named in the result
  of the edit that wrote it, so no such note means it was not shown. The
  [review handoff](#handing-a-doc-over-for-review) rides the note and the preview skill instead.
  Another plugin's `show` tool keeps the engine's placement.
- **A context block.** A `prompt.context` hook appends a `raven` block to the context every
  conversation's first message carries: the pane exists, holds the live diff and rendered docs,
  takes comments, and the `show` tool puts things in it.
- **The MCP server instructions.** A `prompt.attachment` hook replaces the engine's stock line for
  Raven in the MCP server instructions ([`mod-api.md`](./mod-api.md#events-raven-relies-on) has the
  attachment's shape) with one saying what the tool is for; any other plugin's line passes through
  untouched.
- **Notes on an unasked open.** When the main loop's edit makes Raven open a pane by itself, the
  edit's own `tool.call` result carries a note in its `context` (read by the model after the result,
  never shown to the person): the first diff auto-open says the diff is live in the pane, and a doc's
  first auto-show names the path, says the person can comment on its sections, and carries the
  handoff. Plan mode's own plan file gets a note without the handoff (`planNoteOf`), since plan mode
  approves the plan through its own exit. Each doc is named once: a subagent's edit is never told,
  so a doc it opened is named on the main loop's first edit of it, and a doc the main loop put up
  with `show` is never named again. An open the `autoOpen` gate refused, or one the terminal was too
  narrow for, says nothing, and the next edit tries the open again.

### Handing a doc over for review

Once a doc the person should review or approve is in the pane, Claude keeps its chat reply to one
line pointing at the pane and asks with AskUserQuestion ("Looks good, proceed", "I'll comment in the
pane", plus whatever decision the current workflow needs). Proceeding is one click. Commenting takes
a second step, because the question's dialog holds the keyboard and no note can be typed in the pane
while it is open: on "I'll comment in the pane", Claude ends its turn with one line asking for notes
and a reply. The person comments, then replies or presses send, and the notes ride that reply
([`review.md`](./review.md#delivery) owns every delivery path, including notes left earlier riding
the question's answer). Claude addresses them, the doc reloads in place, and Claude asks again until
the person approves. Nothing in the mod blocks on this: it is guidance carried by the tool
description, the auto-open note and the preview skill.

## The directive contract

The `show` tool's input and a line the CLI prints share one shape: `{ op, path?, markdown?, title?, pane? }`.
A CLI directive line is `::<name>::` followed by compact JSON of that shape, one line, printed to
stdout. `directiveOf` validates either source the same way: `op` must be one of the five values,
`show` requires `path`, `note` requires `markdown`, `open` requires a `pane` that is one of the views' subcommands (`diff`, `doc`, `files`, `tasks`; one list in `names.ts`), `diff`'s `path` and title fields are optional,
`comments` takes none, and an unrecognized `op` or a line that doesn't parse is dropped rather than
raised as an error, so extra output around a directive line never breaks the pane.

| `op` | fields | mod action |
| --- | --- | --- |
| `show` | `path`, `title?` | open the Doc view on that file |
| `note` | `markdown`, `title?` | open the Doc view on inline markdown |
| `diff` | `path?` | open the diff pane, selecting `path` when given |
| `open` | `pane` | show that pane, as `/raven <pane>` does, but never hide it: a pane already showing stays showing |
| `comments` | none | answer with the pending review comments as the tool result text |

A directive arriving through Bash is different from one arriving through the tool in one respect
only: a directive's `path` is already absolute (the CLI resolved it against the shell's cwd before
printing), while the tool's `path` is resolved against the session's cwd by the mod itself
(`resolveDirective` in `plugins/raven/hooks/core/raven.ts`) only when it is relative.

On a landed `Bash` (or `PowerShell`) call, the mod scans the command's stdout for `::<name>::` lines
(`directivesIn`), runs each as a directive, and rewrites the tool's result: the directive line and
the CLI's own fallback line (prefixed `Raven pane is not active;`, printed for a reader with no mod
around to consume the directive) are replaced by a short acknowledgement, while anything else the
command printed survives untouched. The model reads a Bash call's result from `result.stdout`, which
is exactly the field this rewrite targets; the hook's own `text` field is not what the model sees.

## The `raven` CLI

The CLI (`plugins/raven/cli/src/`) is a stateless process: every invocation resolves its own
arguments, validates paths against its own `cwd`, prints a directive line, and exits. It never talks
to the mod directly (no IPC, no polling) and it stays useful with function hooks off, since its
second printed line is a plain fallback sentence naming what would have been shown, followed by a
hint to enable function hooks.

```
raven show <path> [--title <t>]     open the Doc view on a file
raven note [--title <t>] [<md>|-]   open the Doc view on inline markdown (stdin when omitted or "-")
raven diff [<path>]                 open the diff pane, optionally selecting a file
raven open <pane>                   open the diff, doc, files or tasks pane (never toggles it off)
raven comments                      ask the pane for pending review comments
```

`show` resolves its path against the CLI's own `cwd` when relative, and checks the path exists and
is a file (not a directory) before emitting a directive, failing with a non-zero exit and a stderr
message otherwise. `note` takes its markdown from the first positional argument, or from stdin when
that argument is omitted or `-`, trimming it and refusing to emit an empty note. `diff` takes an
optional path with the same resolution as `show`, but does not require it to exist. `open` takes one pane name (`diff`, `doc`, `files` or `tasks`) and fails with a non-zero exit and a stderr
message listing the valid names otherwise. `comments` takes
no arguments.

The CLI lives inside the plugin (`plugins/raven/cli/`, not at the repo root) because a plugin install
copies only the plugin's own directory; a shim reaching outside it would exit 127 for anyone who
installed the plugin rather than checked out the whole repository. `plugins/raven/bin/raven` is that
shim: it execs the compiled `dist/raven` binary when present, else runs the TypeScript source under
Bun, resolving both paths through symlinks so it works whether Claude Code invokes it via a plugin
symlink or in place. The CLI imports the mod's own `Directive` type and its name constants
(`DIRECTIVE_PREFIX`, `FALLBACK_PREFIX`, `NAME`) from `plugins/raven/hooks/` at build time, so the two
sides of the contract cannot drift silently.

## The preview skill

`plugins/raven/skills/preview/SKILL.md` carries the guidance for when and how Claude reaches for
`show` (or the CLI fallback). Its triggers:

- Claude produced something the person should read, review or approve, and no tool result said Raven
  already opened it.
- The person asks to see, open or preview something.
- A comparison or checklist reads better rendered than pasted into chat.
- After a batch of edits, Claude wants to point the diff at one file.

It spells out the review handoff above, documents the tool call shape and the CLI's command line side
by side, and tells Claude to check the tool's or CLI's result for whether the pane actually opened
rather than assume it did; the terminal may be too narrow to dock, or function hooks may be off
entirely.

The skill is not named `raven`: a skill sharing the plugin's own name collides with `/raven`, and the
mod's `$.command.register` call for that command is refused when a same-named skill is already
registered. `preview` was chosen instead, and it doubles as the description of what the skill lets
Claude do.

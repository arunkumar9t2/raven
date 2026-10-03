# The agentic layer

Raven's pane reacts on its own to edits, shell calls and watched paths ([`views.md`](./views.md),
[`diff-pane.md`](./diff-pane.md)), but some of what belongs in the pane is only in Claude's head: a plan it just
finished, a file it wants the person to look at, a summary that reads better rendered than pasted
into chat. The agentic layer is how Claude reaches for the pane on purpose — through a native tool
when the engine offers one, through a CLI otherwise — without either path needing to know which of
the two is live.

## The `show` tool

At `session.start`, `plugins/raven/hooks/register.ts` registers a tool named `show` through
`$.tool.register`; the model calls it as `mcp__<plugin>__show`, where `<plugin>` is whatever name
this plugin was loaded under (`$.plugin.name`, not a hardcoded `raven`, since a directory-loaded copy
can carry another name). Its input schema takes an `op` — `show`, `note`, `diff`, `comments` or `open` — and,
depending on `op`, `path`, `markdown`, `title` and `pane`. The engine answers the tool call directly: no
process sits in between, and the same handler that parses a CLI-printed directive parses the tool's
input (`directiveOf` in `plugins/raven/hooks/core/directive.ts`).

A `path` given to the tool resolves against the session's own working directory
(`$.session.cwd()`), not a shell's, because no shell stands between the model and the mod here —
this is the one point where the tool's path resolution differs from a directive parsed off Bash
output. The result text confirms what happened: "Shown in the Raven pane: `<what>`." when the pane
opened, or a message that it could not dock the pane at all (the terminal too narrow) leaving nothing
shown.

## The directive contract

The `show` tool's input and a line the CLI prints share one shape: `{ op, path?, markdown?, title?, pane? }`.
A CLI directive line is `::<name>::` followed by compact JSON of that shape, one line, printed to
stdout. `directiveOf` validates either source the same way — `op` must be one of the five values,
`show` requires `path`, `note` requires `markdown`, `open` requires a `pane` that is one of the views' subcommands (`diff`, `doc`, `files`, `tasks`; one list in `names.ts`), `diff`'s `path` and title fields are optional,
`comments` takes none — and an unrecognized `op` or a line that doesn't parse is dropped rather than
raised as an error, so extra output around a directive line never breaks the pane.

| `op` | fields | mod action |
| --- | --- | --- |
| `show` | `path`, `title?` | open the Doc view on that file |
| `note` | `markdown`, `title?` | open the Doc view on inline markdown |
| `diff` | `path?` | open the diff pane, selecting `path` when given |
| `open` | `pane` | show that pane, as `/raven <pane>` does, but never hide it: a pane already showing stays showing |
| `comments` | — | answer with the pending review comments as the tool result text |

A directive arriving through Bash is different from one arriving through the tool in one respect
only: a directive's `path` is already absolute (the CLI resolved it against the shell's cwd before
printing), while the tool's `path` is resolved against the session's cwd by the mod itself
(`resolveDirective` in `plugins/raven/hooks/core/raven.ts`) only when it is relative.

On a landed `Bash` (or `PowerShell`) call, the mod scans the command's stdout for `::<name>::` lines
(`directivesIn`), runs each as a directive, and rewrites the tool's result: the directive line and
the CLI's own fallback line (prefixed `Raven pane is not active;`, printed for a reader with no mod
around to consume the directive) are replaced by a short acknowledgement, while anything else the
command printed survives untouched. The model reads a Bash call's result from `result.stdout`, which
is exactly the field this rewrite targets — the hook's own `text` field is not what the model sees.

## The `raven` CLI

The CLI (`plugins/raven/cli/src/`) is a stateless process: every invocation resolves its own
arguments, validates paths against its own `cwd`, prints a directive line, and exits. It never talks
to the mod directly — no IPC, no polling — and it stays useful with function hooks off, since its
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
`show` (or the CLI fallback): when the person asks to see, open or preview something; when Claude
finishes a plan or spec outside the paths the Doc view already watches; when a comparison or
checklist reads better rendered than pasted into chat; and, after a batch of edits, to point the
diff at one file. It documents the tool call shape and the CLI's command line side by side, and it
tells Claude to check the tool's or CLI's result for whether the pane actually opened rather than
assume it did — the terminal may be too narrow to dock, or function hooks may be off entirely.

The skill is not named `raven`: a skill sharing the plugin's own name collides with `/raven`, and the
mod's `$.command.register` call for that command is refused when a same-named skill is already
registered. `preview` was chosen instead, and it doubles as the description of what the skill lets
Claude do.

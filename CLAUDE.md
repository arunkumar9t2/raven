# CLAUDE.md

Raven (working title) is a Claude Code plugin: a **mod** (function-hooks module) that docks a live
preview pane beside the transcript — the session's diff with review comments, rendered plans and docs
— plus a Bun **CLI** and a **skill** that let Claude drive the pane on purpose.

`docs/spec.md` is the source of truth for behaviour and the mod/CLI boundary. `docs/progress.md` is
the running decision log and milestone list. `docs/research/` distils the (undocumented, early
access) mod API; `types/claude-code.d.ts` is the authority when they disagree.

## Layout

```
.claude-plugin/marketplace.json   catalog (one plugin)
plugins/raven/
  .claude-plugin/plugin.json
  hooks/hooks.json                names the module: ./register.ts
  hooks/register.ts               binds `$` into a Host, forwards engine events to core/raven
  hooks/core/                     controller, Host, View contract, triggers, directive parser
  hooks/views/                    one file per pane (diff, doc) + icons
  hooks/git/  hooks/review/       pure logic: git parsing/loading, review comments
  skills/preview/SKILL.md         when/how Claude runs the CLI
  bin/raven                       shim: dist/raven if built, else `bun cli/src/main.ts`
  tests/unit/                     bun tests of the pure modules
cli/                              the `raven` CLI source + tests
scripts/cc.sh                     drives a real Claude Code session in tmux (closed-loop checks)
types/claude-code.d.ts            the mod API declarations (from /plugin-types)
```

## Commands

```bash
bun run check        # typecheck + biome + unit tests + mod tests + plugin validate
bun run typecheck    # tsc for the mod (jsx=h, no Node) and the CLI (bun-types)
bun run lint:fix     # biome
bun test ./cli ./plugins/raven/tests/unit
bun run build        # compiles the CLI to plugins/raven/dist/raven (gitignored)
bun run validate     # claude plugin validate --strict, marketplace + plugin
```

## Closed loop

`scripts/cc.sh start` opens a throwaway git repo in tmux running Claude Code (Haiku by default, via
`--model`, never `/model`, which rewrites the user's default) with this plugin and function hooks on.
`cc.sh type "/raven"`, `cc.sh click <col> <row>` (SGR mouse, presses Buttons and focuses Inputs),
`cc.sh keys …`, `cc.sh cap`, `cc.sh stop`. Prefer zero-token checks: edit files from the shell and
use `/raven` rather than prompting the model.

## Rules for the mod code

- The module runs in a sandbox: no Node, no `require`, no npm packages, no JSON imports. Only
  relative, extensionless imports of `.ts`/`.tsx` files under `hooks/`.
- `register.ts` stays thin. Views never touch `$`; they take a `Host`, so pure logic is unit-testable
  with bun.
- A new pane is a `View` in `hooks/views/` plus one entry in `core/raven.ts`; a new reaction to a tool
  call is one `Trigger` in `core/triggers.ts`; a new CLI op is one directive variant in `hooks/core/directive.ts` (the CLI imports its type).
- Every name derived from "raven" comes from `hooks/names.ts`; the CLI imports it at build time.
- `Code` caps `source` at 10 000 chars; render per hunk.
- Raven state never lands in the working tree (it would show in its own diff): use `$.store`.

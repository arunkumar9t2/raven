# Development

This is where to look for how the repository is laid out, how its scripts fit together, how its two
kinds of tests differ, how to drive a real session without spending model tokens, and what the
sandbox the mod runs in demands of its code. `CLAUDE.md` at the repo root points here for these facts
rather than repeating them.

## Repository layout

```
.claude-plugin/marketplace.json    catalog: one plugin, "raven", sourced from ./plugins/raven
plugins/raven/
  .claude-plugin/plugin.json       plugin manifest: name, description, userConfig fields
  hooks/hooks.json                 names the function-hooks module: ./register.ts
  hooks/register.ts                binds `$` into a Host, forwards engine events to core/raven
  hooks/core/                      controller (raven.ts), Host, View contract, triggers, directive
                                    parsing, settings, band state, checkpointing, auto-open
  hooks/views/                     one file per pane (diff, doc, files, tasks) plus band and icons
  hooks/git/  hooks/review/        pure logic: git parsing/loading, review comments, tasks
  skills/preview/SKILL.md          when and how Claude drives the pane
  bin/raven                        shim: dist/raven if built, else `bun cli/src/main.ts`
  cli/src/                         the raven CLI source
  cli/tests/                       CLI unit tests (*.spec.ts)
  tests/unit/                      bun tests of the pure modules (*.spec.ts)
  tests/*.test.ts                  mod tests run through `claude plugin test` (register, surfaces)
scripts/cc.ts                      drives a real Claude Code session in tmux (closed-loop checks)
scripts/setup-local.ts             loads the plugin into every local session live from this checkout
types/claude-code.d.ts             the mod API declarations, kept in sync from the engine's own copy
```

`shared` state and pure logic are kept out of `hooks/views/` on purpose: a view file draws; the git
and review parsing it depends on lives in `hooks/git/` and `hooks/review/` precisely so it can be
unit-tested with bun without touching the engine's sandboxed module system at all.

## Scripts and the gate

```bash
bun run typecheck    # tsc for the mod (jsx=h, no Node) and the CLI (bun-types), two separate configs
bun run lint         # biome check .
bun run lint:fix     # biome check --fix .
bun run test         # bun test ./plugins/raven/cli ./plugins/raven/tests/unit
bun run test:mod     # CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test plugins/raven
bun run validate     # claude plugin validate --strict, both the marketplace and the plugin
bun run check        # typecheck && lint && test && test:mod && validate — the full gate
bun run build        # compiles the CLI to plugins/raven/dist/raven (gitignored)
bun run types:sync   # copies the engine's declarations into types/claude-code.d.ts
bun run setup:local  # wires this checkout into every local Claude Code session (see below)
```

`bun run check` is the gate: every one of its five steps must pass before a change is considered
done. Plain `bun test` (with no path arguments) is wrong here — it walks the whole tree and picks up
`tests/*.test.ts`, the mod-kit tests meant for `claude plugin test`'s own harness, and fails against
`bun:test`'s runner. `bun run test` scopes to exactly the CLI and pure-module suites bun can run.

## Unit tests vs. mod tests

Two test kinds live side by side and are told apart by extension, not by directory alone:

- **Unit tests** (`*.spec.ts`, run by `bun test`) exercise pure functions and pure modules — parsing,
  formatting, tree building, settings defaults — with no engine involved. `plugins/raven/cli/tests/`
  and `plugins/raven/tests/unit/` hold these. Biome's own file-matching and bun's own test discovery
  both key off this suffix.
- **Mod tests** (`*.test.ts`, run by `claude plugin test`) exercise the function-hooks module against
  the engine's own test harness (`claude-code/testing`, whose `describe`/`test`/`tier`/`mock` mimic
  `bun:test`'s shape but drive a real `On` registration and a fake `Engine`). These need
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` and live directly under `plugins/raven/tests/`
  (`register.test.ts`, `surfaces.test.ts`), not under `tests/unit/`, so `claude plugin test` can find
  them without also trying to load the bun-only suites.

## The closed-loop tmux harness

`scripts/cc.ts` drives a real Claude Code session inside tmux so the mod can be exercised and its
pane captured without a person at the keyboard, and without spending model tokens on most checks.
It is a strongly typed Bun script (its own `scripts/tsconfig.json`, unit-tested by
`scripts/cc.spec.ts`), not a shell script, because `start` needs to scrub the caller's own
`CLAUDE_CODE_*`/`CLAUDECODE*` environment before launching — running it from inside a Claude Code
session must never leak that session's `CLAUDE_CODE_PLUGIN_DIRS` or child markers into the session
it starts:

```bash
scripts/cc.ts start [workdir]             # default workdir: a throwaway git repo with one uncommitted edit
scripts/cc.ts type <text>                 # types text into the composer and presses Enter
scripts/cc.ts keys <key>...               # raw tmux keys: Enter, Escape, Down, C-c, …
scripts/cc.ts click <col> <row>           # left-click at a 1-based screen cell, via SGR mouse sequences
scripts/cc.ts hover <col> <row>           # move the pointer to a 1-based screen cell, via SGR mouse motion
scripts/cc.ts wheel <col> <row> up|down   # scroll wheel tick at a 1-based screen cell, via SGR mouse
scripts/cc.ts cap                         # print the visible screen
scripts/cc.ts stop                        # kill the tmux session
```

`start` launches `claude` with the no-flicker fullscreen layout on and file checkpointing off
(`CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING=1`) so the built-in diff panel does not auto-open over
Raven's own dock, and `RAVEN_CLAUDE_ARGS` appended for extra flags such as `--allowedTools
'Bash(raven:*)' Write`. It always runs with the default model — never `/model`, since that rewrites
the person's own default persistently. Before launching, it drops every `CLAUDE_CODE_*`/
`CLAUDECODE*` name from the caller's env (and any already sitting in a live tmux server's global
env from an earlier, unscrubbed launch) and sets only its own three: `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`,
`CLAUDE_CODE_NO_FLICKER=1`, `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING=1`. Plugin loading comes from
`--settings <file>` (via `RAVEN_CLAUDE_ARGS`) or from `bun run setup:local`'s persistent
`~/.claude/settings.json` entry — never from an inherited `CLAUDE_CODE_PLUGIN_DIRS` — so the scrub
never breaks loading the checkout under test. Checkpointing stays off for every run this harness
drives, for the same reason `start` disables it.

`click`, `hover` and `wheel` send SGR mouse escape sequences directly (button-press then
button-release for a click; button code 35 with no button held for hover/motion; button codes
64/65 for wheel-up/wheel-down) rather than relying on tmux's own mouse mode, so they work
identically whether or not the terminal emulator running tmux has mouse reporting enabled.

Prefer zero-token checks over prompting the model: edit files from the shell and drive `/raven`
through `cc.ts type`/`click` rather than asking Claude to do the edit or the toggle itself. Reserve
an actual prompt for what only the model can produce — an edit whose content matters, or a turn
whose reply needs judging.

`cc.ts type "/raven"` on its own is refused (exit 2): the composer's own command typeahead can
complete the bare command to `/raven:preview` (the skill, not the mod's `/raven` command) before
Enter lands, which would start a real model turn instead of toggling the pane for free. Always type
a full subcommand — `/raven diff` (or `doc`/`files`/`tasks`/`send`) — never the bare `/raven`, in
any script that must not spend tokens.

A chip row's hover (see `chips.tsx`'s `chipRow` doc comment) can be probed from this harness too:
`cc.ts hover <col> <row>` sends an SGR mouse *motion* event over a chip's cell, driving hover the
same as a real pointer move, with no click. A `cap` right after shows the chip's hover-group
siblings jump from dim to full strength and the pointed chip itself invert.

## Local loading

`scripts/setup-local.ts` (`bun run setup:local`) makes every local Claude Code session load this
checkout live, rather than from an installed or cached copy, by editing
`~/.claude/settings.json`: it sets `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`, adds this repository's
`plugins/raven` to `CLAUDE_CODE_PLUGIN_DIRS` (removing any stale entry for the same path first), and
allows `Bash(raven:*)` so Claude can run the CLI without a permission prompt on every call. It is
idempotent — a second run changes nothing — and additive: other entries already in
`CLAUDE_CODE_PLUGIN_DIRS` and the allow list are preserved. `--remove` undoes exactly these three
edits (function hooks are left on, since other mods may depend on them); `--dry-run` prints the
resulting file without writing it. A `CLAUDE_CODE_PLUGIN_DIRS` entry is read live from disk on each
session and hot-reloads when the mod's sources change, unlike a directory marketplace install, which
is served from a cached copy. A chezmoi-managed settings file needs `chezmoi add
~/.claude/settings.json` after this script runs, or the next `chezmoi apply` discards the change.

## Types sync

The engine writes its own current type declarations to
`plugins/raven/.claude-plugin/types/claude-code/index.d.ts` on load, since the mod API is early
access and otherwise undocumented outside the engine binary itself; `bun run types:sync` copies that
file to `types/claude-code.d.ts`, the copy this repository's own `tsconfig`s and editors resolve
against. Run it after upgrading Claude Code, and treat the copied file as the authority whenever it and
[mod-api.md](./mod-api.md) disagree.

## Building the CLI

`bun run build` compiles `plugins/raven/cli/src/main.ts` to a single-file binary at
`plugins/raven/dist/raven` with `bun build --compile`; the binary is gitignored, so `plugins/raven/bin/raven`
falls back to running the TypeScript source directly under Bun whenever the compiled binary is
absent. [`agentic.md`](./agentic.md) covers why the CLI's source lives under `plugins/raven/cli/` rather than at
the repository root.

## Rules for mod code

`hooks/` runs inside Claude Code's own sandbox: no Node, no `require`, no npm packages, and no JSON
imports — only relative, extensionless imports of `.ts`/`.tsx` files under `hooks/` itself. This is
why pure logic (git parsing, review comments, task folding) is split into `hooks/git/` and
`hooks/review/`: those modules import nothing sandboxed and so are directly unit-testable with bun,
while anything that touches the engine goes through the `Host` interface instead of the raw `$`
binding.

`register.ts` stays thin: it binds `$` into a `Host` once at `session.start` and forwards every
engine event to `core/raven.ts`'s controller, with no view-specific logic of its own. Views never
receive `$` directly — they take a `Host`, so their pure logic can be exercised without the sandbox
at all. A new pane is a `View` in `hooks/views/` plus one entry in `core/raven.ts`; a new reaction to
a tool call is one `Trigger` entry in `core/triggers.ts`; a new CLI op is one directive variant added
to `hooks/core/directive.ts`, which the CLI imports rather than redeclaring. Every name derived from
the product's working title — "raven" — comes from `hooks/names.ts`, which the CLI also imports at
build time, so a future rename is mechanical rather than a grep-and-replace across both halves of the
plugin.

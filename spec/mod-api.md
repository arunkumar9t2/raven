# The mod API

Raven's mod layer is a Claude Code *mod*: a TypeScript function-hooks module the engine loads and
runs in its own process, reacting to engine events rather than to a request/response cycle a plugin
author drives. This spec collects what Raven relies on from that API — the parts durable enough to
document, verified against `types/claude-code.d.ts` (the authority when it and anything else
disagree) and against `plugins/raven/hooks/`. It does not restate [`architecture.md`](./architecture.md)'s
account of Raven's own controller and views; it owns the engine's side of that boundary.

## Enabling a mod

Function hooks are early access: no official docs page, the types file's header is the only
authority. A session needs `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in its environment before a mod's
hooks are read at all. A plugin loads either through normal plugin installation or, for local
development, by naming its directory in `CLAUDE_CODE_PLUGIN_DIRS` (a `path.delimiter`-joined list) or
passing `--plugin-dir <path>` on the command line. `scripts/setup-local.ts` does the former,
idempotently, against `~/.claude/settings.json`'s `env`; `scripts/cc.sh` does the latter for a
throwaway tmux session. A `--plugin-dir` plugin's key is its `plugin.json` name, not a marketplace
entry; `claude plugin validate` names any hook the engine would refuse to register, so a plugin
author sees the same rejection statically that a live session would raise at load.

A plugin loaded from a directory this way is read live off disk and hot-reloads when its sources
change during a session — unlike an installed marketplace copy, which is served from a cache and
does not. Raven depends on this for its own development loop.

## Plugin layout

A mod's `hooks/hooks.json` names the module the engine loads: `{ "description": …, "modules":
["./register.ts"] }`. Mixing classic hook-key configuration (`PreToolUse` arrays and the like) into
the same file is unverified territory Raven does not exercise. A plugin's `bin/` directory goes on
the Bash tool's PATH while the plugin is enabled — the mechanism `plugins/raven/bin/raven` uses to
put the CLI within Claude's reach — at the cost of making the plugin ineligible for claude.ai/Cowork
organization sync. A plugin may also ship skills (`skills/<name>/SKILL.md`) alongside its hooks
module; Raven's is [`agentic.md`](./agentic.md)'s concern. `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`
(`~/.claude/plugins/data/<plugin-id>/`) and `${CLAUDE_PROJECT_DIR}` are substituted into hook commands
and skill markdown; they are not exported into the Bash tool's own environment, so a shell command
cannot read them directly.

A skill named identically to its plugin claims that plugin's slash command namespace and is refused
alongside a `command.register` of the same name — one name, one owner; [`agentic.md`](./agentic.md)
covers why this is the reason Raven's own skill is not named `raven`.

`/model` is a global rewrite of the person's own default model, not a per-session override; a mod's
development harness (`scripts/cc.sh`) never touches it, driving the default model instead.

## The sandbox

A hooks module runs in its own sandbox: no Node globals, no `require`, no npm packages, no JSON
imports. Every import must be relative and extensionless, resolving to a `.ts`/`.tsx`/`.js` file
under the plugin's own `hooks/` tree — `plugins/raven/hooks/register.ts` importing
`./core/raven` rather than `./core/raven.ts` or a package name is this constraint, not a style
choice. The sandbox's own globals cover `URL`, `TextEncoder`, `AbortController`, `crypto.subtle`, and
the two the JSX pipeline needs: `h` (the factory) and `Fragment`. A module's `tsconfig.json` sets
`jsx: "react"`, `jsxFactory: "h"`, `jsxFragmentFactory: "Fragment"`, no `@jsx` pragma required per
file, and includes the types directory alongside `hooks/` and `tests/`. Anything the module needs
from disk goes through `$.fs.read` against `${$.plugin.root}`, never a bare Node file read.

## Types

The engine writes the current type declarations to `.claude-plugin/types/claude-code/index.d.ts` on
load, inside the plugin's own tree; `import type … from 'claude-code'` in a hooks module is
types-only and resolves against that generated file. `/plugin-types`, run in a session, writes the
same declarations to `.claude/types/claude-code.d.ts` for editor tooling outside the plugin. Raven's
`bun run types:sync` copies the plugin-local copy to `types/claude-code.d.ts` at the repo root so the
CLI and tests, which sit outside the sandbox, type-check against the same authority.

## Events Raven relies on

`register(on, options)` is the module's one export; `on(pattern, matcher?, ($, e, next) => …)` binds
a handler to an event, optionally narrowed by a literal, `RegExp`, array or partial-object matcher.
`next(e)` passes the event to the next hook in the chain (any plugin's, in load order), optionally
rewriting fields the matcher didn't pin; a call no hook in the chain answers fails, so a hook that
means to fully own an event must answer it rather than fall through. `plugins/raven/hooks/register.ts`
takes this literally at `tool.call`: the handler bound to the `show` tool's own name answers without
calling `next` at all, so the module's second, catch-all `tool.call` hook — which reacts to every
tool the model calls, not just Raven's own — never re-processes that same call. A module may bind
only one hook per event without a matcher; a second is refused at load, so the `show` tool's hook
carries a matcher.

- **`session.start`** — input carries `{cwd, surface, isInteractive}`. Raven binds its `Host` here
  once (`register.ts`), registers its slash command and its `show` tool, and hands the created
  controller to every later hook through a closure variable. A `$.tool.register` call must be awaited
  before a later `session.start` hook's `next(e)` runs, or the tool is not yet listed by the first
  model turn.
- **`command.run`** / **`command.register`** — `command.register({name, description,
  argumentHint?, immediate?})` claims a slash command; `command.run`'s input is `{command, args,
  origin, presentation: {isFullscreen, columns}}`, and a hook answers with `{text?, context?}`. Raven
  registers `/raven` once at `session.start` and answers `command.run` by forwarding `args` to its
  controller.
- **`ui.render`** — fired once per drawing pass per component; Raven matches on `component: 'Pane'`
  (its own pane ids, checked against `PANE_IDS`), `component: 'AbovePrompt'` (the status band), and
  `component: 'CommandOutput'` narrowed further to `props: {command: 'raven'}` (the `/raven` reply
  row). A `Pane`'s props carry `{title, isFocused, bodyColumns, placement: 'dock'|'inline', scroll:
  {offset, bodyRows}, view: {agentId?}}`; the event's `viewport` carries `{columns, rows,
  isFullscreen?}`. Slots beyond the three Raven draws into — `AskUserQuestion`, `UserMessage`,
  `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `ToolProgress`, `Spinner`,
  `TurnDuration`, `InfoNotice`, `SessionMode`, `PromptHint` — exist in the same event but go unhandled
  here.
- **`ui.scroll`** — input `{component, requestId, offset, by, bodyRows, contentRows, origin,
  pointer?}`; returning `{}` claims ownership of the scroll instead of falling through to the
  engine's own. Raven answers it only when the scroll's `origin.kind` is `'person'` and its own view
  reports having handled the `by` delta, so a programmatic scroll (a redraw after new content lands)
  is left to the engine.
- **`ui.close`** — fired with `origin` naming whose close it is; Raven's handler runs `next(e)` first
  and only updates its own `open` bookkeeping once the result shows the close was not denied
  (`result.deny === undefined`), so a refused close never desyncs the controller's idea of what is
  open from the engine's.
- **`ui.focus`** — raised whenever an element takes the keyboard, origin `plugin` when a mod's own
  `$.ui.focus` call caused it. `$.ui.focus` is refused unless the pane named in its `requestId`
  already holds the keyboard, which is why Raven's own focus helper opens the pane with `focus: true`
  before calling `$.ui.focus`, rather than asking `$.ui.focus` alone to take it. `autoFocus` on an
  element only seats the site's own focus ring inside a pane that has already taken the keyboard by
  some other means (a focused open, or the person's own focus chord) — it does not itself pull the
  keyboard away from the composer.
- **`tool.call`** — the result union is `{deny}` | `{result, text?, context?}` | `{isError: true,
  result, text?}`; a hook may rewrite `text`, which is what the model reads back, independent of
  `result`, which is what a later hook or the transcript's structured tool-result sees. For a Bash
  call, the model's own read of the result comes from `result.stdout`, not the hook's `text` field —
  Raven's directive-ack rewrite (`register.ts`'s catch-all `tool.call` hook) replaces the CLI's
  directive and fallback lines inside `result.stdout` itself, keeping `text` and `result.stdout`
  aligned, because rewriting only `text` would leave the model reading the unswapped CLI output.
  `e.tool` for an MCP tool call is spelled `mcp__<server>__<name>`; Raven's own tool answers on a
  `RegExp` matcher (`^mcp__.+__show$`) because the plugin's own name is not known statically at
  matcher-registration time, only once `$` binds inside the handler.
- **`tool.register`** / **serving an MCP tool** — `$.tool.register({name, description,
  inputSchema?})` returns once the tool is listed; the model calls it as `mcp__<plugin>__<name>`. A
  mod serves the call itself with a `tool.call` hook matched on that full name — there is no separate
  registration for *how* the tool answers, only for what it is named and described.
- **`prompt.submit`** — input carries `origin: PromptOrigin`, whose `kind` tells a person's own
  submission (`'composer'`, or `'bridge'` for Remote Control) from every other source (an agent's own
  turn, a scheduled run). A hook injects hidden context for the next turn by calling `next({...e,
  context: [...(e.context ?? []), text]})`; `prompt.context` and `prompt.section` exist to rewrite
  fixed blocks instead of appending, which Raven does not use. Raven's review comments ride only a
  person's own prompt (`origin.kind` `'composer'` or `'bridge'`), never an agent's or a forked turn's,
  so a subagent never sees another conversation's pending review injected into its own context.
- **`turn.complete`** — Raven reacts only when `e.reason === 'answer'` and `e.agentId === undefined`,
  i.e. the main loop's own turn finished by answering, not a subagent's turn and not one interrupted
  or errored. A turn that is itself a fork of the module's own resolution prompt (below) raises no
  `turn.complete` the types promise on, which is why Raven's re-entrancy guard against overlapping
  forks matters independently of this filter.
- **`model.fork`** — `$.model.fork({prompt})` runs a prompt against a fork of the main thread's last
  turn and resolves to `{isAnswered, text?, reason?}` once done (or an unanswered result naming why).
  Raven's controller uses it once per batch of sent review comments to ask which the finished turn
  addressed, caps itself at one fork in flight, and treats a null or unparseable reply as "leave
  everything sent" rather than as "nothing was addressed".
- **`prompt.fill`** / **`prompt.submit` (as an outbound call)** — `$.prompt.fill({text, mode})`
  replaces or inserts into the prompt box's own draft and resolves `{isFilled, refusal?:
  'no_composer'|'dialog'}`; a hook on the `prompt.fill` event itself sees any plugin's fill request
  pass through and may rewrite `text` by `e.mode`, which Raven does not do. `$.prompt.submit({text})`
  submits a prompt outright, the same call path the person's own Enter takes; Raven's "send" action
  uses it to submit the review as a visible prompt rather than hidden context, precisely so the
  person can see what Claude was asked.
- **`$.process.run`** — `(argv, {cwd, env, stdin, timeoutMs})`, no shell in between, resolving
  `{exitCode, stdout, stderr}`. Raven's `Host.run` wraps it for git plumbing; the mod never shells out
  through Bash's own tool, since nothing routes a mod's own commands through the model's tool-call
  loop.

## UI elements and their caps

Every terminal element Raven draws is checked against `Elements['terminal']`; `Image`, `Input` and
`Select` are declared optional on Raven's own `Ui` type (`plugins/raven/hooks/core/view.ts`) because
not every surface's table carries them — see [`settings-and-surfaces.md`](./settings-and-surfaces.md) for how a view degrades
when one is missing. Caps and behavior worth knowing before drawing:

- `Markdown`, `Code` and `Text` each cap their text at 10 000 characters; an element over that cap is
  not truncated for you — the engine refuses the whole drawing that contains it. Raven clamps a
  hunk's diff text below the cap itself (leaving room for a truncation marker) and splits a long
  markdown document into several `Markdown` elements at blank lines outside code fences, for exactly
  this reason.
- `Code`'s `format: 'diff'` reads `source` as one or more unified-diff hunks (`@@ -a,b +c,d @@` then
  ` `/`+`/`-` lines, an optional `---`/`+++` pair, a trailing "no newline" marker) and draws gutters,
  line markers and add/remove backgrounds from them; a `source` that does not parse as hunks under
  that format is refused outright, not degraded to plain text. The `@@ … @@` header draws no row of
  its own, so a hunk's height is its body line count — one row per line under `wrap: 'truncate-end'`,
  which is what Raven's row accounting in [diff-pane.md](./diff-pane.md) relies on.
- `Select`'s options are drawn from `SelectOption[]`, one currently-selected value shown collapsed
  against the label until the person opens it; collapsed, it is one row, and its option list opens as
  an overlay that takes no layout; Raven's own fallback for a surface without `Select` —
  a row of plain buttons — exists because a surface missing the element has no picker at all, not a
  worse-looking one.
- `Image`'s `source` (`ImageSource`) is base64 bytes the plugin holds directly (`{png}`, at most 2 MiB
  decoded, or `{rgba, width, height}`), or the absolute path of a file or POSIX shared-memory object
  another process wrote, which the terminal — running as the person, never through `$` — opens,
  decodes and sizes itself. A file source is either a whole PNG (`{file, format: 'png'}`) or raw
  pixels (`{file, format: 'rgba'|'rgb', width, height}`); a name pointing at something the terminal
  will not read (not a regular file, under `/proc`/`/sys`/`/dev`, gone, across ssh) draws a blank box
  and logs why to the debug log rather than failing the render. Raven's Doc view draws a shown
  image's path as dim text on any surface whose table has no `Image` at all, rather than attempt one
  of these sources blind.
- A `Fragment` inside a row `Box` lays its children out as a box of their own, pushing them onto a new
  line even when they would fit; conditionally drawn siblings in a row are written as separate
  expressions rather than wrapped in `<>…</>`.

### Colours and the theme

A `Text` or `Box` colour prop takes either a raw colour or a Claude Code theme key (`claude`, `text`,
`subtle`, `inactive`, `success`, `error`, `warning`, `permission`, `suggestion`, `diffAdded`,
`diffAddedWord`, `diffRemoved`, `diffRemovedWord`, `promptBorder`, `planMode`, …). The engine
resolves a key against the active theme — light or dark, the `/theme` choice, or a custom theme in
`~/.claude/themes/` — so a key-coloured tree follows the person's theme with no code of its own; the
built-in diff mod colours everything by key. `Code` and `Markdown` are drawn by the engine and follow
the theme already. `$.config.list()` exposes the selected theme's name and `config.set` with
`{ key: 'theme' }` observes a change, but no API reads a theme's palette, and a plugin cannot ship a
theme. The pane chrome — tab bar, divider, close glyph and background — is the engine's: `PaneOpenArgs`
carries no colour or style, and the active tab is drawn in reverse video (`inverse`, no colour), so
its highlight comes from the terminal's own palette rather than the theme. A plugin that wants its
own highlights to match draws them with `inverse` and colours everything else by theme key.

## Panes

`$.ui.open({id, title?, focus?, closeOnEscape?, holdToasts?, rows?, columns?})` opens or re-surfaces a
pane; an `id` is 1–64 characters of `[A-Za-z0-9_-]`. The engine shows one pane at a time and tabs the
rest, so several ids opened at once become a tab bar, not stacked panes. Reopening an already-open id
only retitles it — it does not bring a background tab forward — which is why Raven's `show` closes
and reopens a pane it means to bring forward rather than calling `open` again on the same id. A pane
asked to dock below the floor the terminal enforces (110 columns requested minimum, 144 the
unrequested default) is left waiting undrawn; `$.ui.panes()` reports such a pane's `isPlaced: false`,
and Raven withdraws (closes) a pane left in that state rather than let it seat itself on a later
resize. Docking at all requires the fullscreen layout (`CLAUDE_CODE_NO_FLICKER=1`); without it panes
have nowhere to dock. `$.ui.close({id})` raises `ui.close` with `origin` naming whose close it is, and
may itself be denied by another hook in the chain.

## The native diff panel

Claude Code's own built-in diff panel is not a plugin pane — it is not one of the ids a mod's
`$.ui.panes()` enumerates, and no hook of Raven's owns it. It auto-opens on the first checkpointed
edit and takes the dock over any plugin pane, Raven's included, when it does. Whether it opens at all
is gated by file checkpointing itself (`fileCheckpointingEnabled` in `$.settings.read()`, or
`CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING` turning it off outright, the same variable Raven's own
development harness sets); checkpointing is also what backs `/rewind`, so disabling it to keep the
dock free costs that command. [`settings-and-surfaces.md`](./settings-and-surfaces.md) owns the
`diffSidebarOpen` preference check and how Raven warns about the panel taking the dock.

## Hot reload

A mod loaded from a live directory (`CLAUDE_CODE_PLUGIN_DIRS` or `--plugin-dir`) reloads its module
when the underlying files change during a session, without a restart. A reloaded module's closures
start empty — the new instance has no memory of which panes an earlier instance opened — so a
controller that tracks "am I open" locally must reconcile against the engine's own idea of what is
shown (`$.ui.panes()`) rather than trust its own bookkeeping after a reload; Raven's `render` hook
re-adopts a pane this way the first time it is asked to draw into an id it does not remember opening.

## The test kit

`claude plugin test <dir>` runs a plugin's tests inside the sandbox, with function hooks enabled in
the invoking environment; Raven's own is `bun run test:mod`. The kit (imported as `claude-code`'s
testing surface) provides `describe`/`test`/`expect`, a `mock` for the world beneath the plugin
(`mock.clock`, `mock.store`, `mock.env`) and `on(...)` to answer every `$` call a test's hooks make —
there is no filesystem, network or process access under test, so a hook that calls `$.fs.read` or
`$.process.run` needs an `on` handler standing in for it or the test hangs waiting for an answer that
never comes. `$.ui.mount({plugin, surface, component, props})` draws one component through a named
element table and returns handles the test acts on (presses, input, select) to exercise a render
without a live engine; there is no way from the kit to vary a mount's options once it is drawn — a
test that needs to compare two variants mounts twice. `claude plugin validate <path> [--strict]
[--json]` statically analyses the hooks module for what it hooks and calls, and for anything the
engine would refuse to register at load, so a validation failure names a defect before a session ever
loads the plugin.

## Where Raven's own contracts continue

This spec stops at the engine's boundary. [`architecture.md`](./architecture.md) covers what Raven
builds on top of it — the `Host` abstraction, the view/trigger/controller shapes, and where session
state actually lives. [`agentic.md`](./agentic.md) covers the `show` tool and CLI directive bridge
this spec's events make possible. [`diff-pane.md`](./diff-pane.md), [`review.md`](./review.md),
[`views.md`](./views.md) and [`settings-and-surfaces.md`](./settings-and-surfaces.md) cover what
Raven draws with the elements and panes this spec describes.

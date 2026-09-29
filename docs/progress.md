# Raven progress log

Working title **Raven** (rename pending). Live-preview side pane for Claude Code built as a mod
(function-hooks plugin) plus a Bun CLI and skill.

## Resume here

M6 in progress: `docs/superpowers/plans/2026-09-29-raven-m6.md` (gitignored; the plan's
"Execution order" section is authoritative). Current task: **15, 17**, then 16, final review. Done: 1–14 + two simplify passes.

## Milestones

- [x] M0 smoke mod: /raven opens docked pane (Markdown, Code diff, Button, Input); bin/ on PATH; Bash stdout intercept; prompt.submit context; validate + plugin test
- [x] M1 diff view: file list + per-hunk Code diff in one pane, refresh on Edit/Write/Bash
- [x] M2 doc view: auto-show markdown written to plan/spec dirs (superpowers, ~/.claude/plans)
- [x] M3 review comments: comment on file/hunk, ride next prompt / Send button
- [x] M4 CLI + skill: `raven show|diff|comments`, directive bridge via Bash result intercept
- [x] M5 simplify, review, validate, e2e

## Decisions

- 2026-09-29 Repo lives at ~/Work/projects/claude-mod (temporary); the name "raven" is one constant so a rename is mechanical.
- 2026-09-29 Mod layer owns everything in-session: UI, event reactions, prompt injection, state. The CLI is stateless: it is the agentic entry point Claude reaches through Bash and prints a directive the mod intercepts from the Bash tool result (no polling, no IPC). With function hooks off the CLI prints plain useful output instead.
- 2026-09-29 The compiled Bun binary is not committed: `bin/raven` is a shim that execs `dist/raven` when built, else `bun cli/src/main.ts`.
- 2026-09-29 Raven state stays out of the working tree (`$.store`), so it never shows up in its own diff pane.
- 2026-09-29 Only one pane shows at a time (others become tabs), so the file list and hunks share one pane. `Code` caps source at 10k chars: render per hunk.
- 2026-09-29 Superpowers writes specs/plans to docs/superpowers/{specs,plans}/ and working notes to .superpowers/; built-in plan mode writes ~/.claude/plans/.
- 2026-09-29 Weekly usage was at 87% at session start: verification prefers zero-token paths (slash commands, `claude plugin test`, shell edits) over live prompts.
- 2026-09-29 Verified in tmux (Haiku): /raven docks the Diff pane; file rows select; hunk/file comments via Input; Send submits the review as a visible prompt and Claude acts on it; `raven note` and a Write under docs/superpowers/plans/ open the Doc pane; the engine draws a Diff|Doc tab bar.
- 2026-09-29 The skill is named `preview`, not `raven`: a skill named like the plugin claims `/raven` and the mod's `command.register` is refused.
- 2026-09-29 Focus: `autoFocus` does not take the keyboard from the composer and `$.ui.focus` is denied unless the pane holds it; the comment Input asks `ui.open({ focus: true })` first, then focuses its key.
- 2026-09-29 Send puts the review in the submitted prompt's text rather than hidden context, so the person sees what Claude was asked; ordinary prompts still carry pending comments as hidden context.
- 2026-09-29 Reopening an open pane id only retitles it; `show` closes and reopens a background tab to bring it forward.
- 2026-09-29 The native built-in diff panel (not a plugin pane in this build) auto-opens on the first checkpointed edit and takes the dock over Raven. It obeys the `diffSidebarOpen` global preference (closing it once sets false). The harness runs with `CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING=1` rather than touching the user's config.
- 2026-09-29 The engine writes current types to `plugins/raven/.claude-plugin/types/` on load; `bun run types:sync` copies them to `types/`.
- 2026-09-29 The mod hot-reloads when its sources change during a session.
- 2026-09-29 Simplify pass (4 Sonnet reviewers): views declare their `/raven` subcommand; triggers emit `reload-doc` and `main-loop-edit`; focus goes through the controller; the CLI imports names and the Directive type from the mod at build time.
- 2026-09-29 Correctness review: a Bash call that printed a directive keeps its other output (only directive/fallback lines give way to the ack); only composer prompts carry the hidden review; diff refreshes carry a generation so a stale read never lands; `raven comments` consuming the comments is intended (they reach Claude as the tool result). Skipped: serializing overlapping `show()` of one view.
- 2026-09-29 Nerd Font glyphs are emitted correctly (U+E628 etc. present in the output); a plain `tmux capture-pane` view just doesn't draw them.
- 2026-09-29 The CLI lives in `plugins/raven/cli/`: an install copies only the plugin directory, so a shim reaching outside it exits 127 for everyone else. Its bun tests are `*.spec.ts` so `claude plugin test` does not try to load them.
- 2026-09-29 The model reads a Bash call's result from `result.stdout`, not the hook's `text`: the directive ack replaces the CLI's lines in `stdout` (verified live: the transcript's tool_result is the ack).
- 2026-09-29 Hidden review context verified live (delivered as a system-reminder on a composer prompt). Comments persist per repository in `$.store` until sent, so a restarted session re-sends old unsent ones.
- 2026-09-29 Loaded in all of the user's local sessions via `CLAUDE_CODE_PLUGIN_DIRS` (settings `env`): read live from disk and hot-reloaded, unlike a directory marketplace, whose installs are served from a cache copy.
- 2026-09-29 `Markdown`, `Code` and `Text` each cap their text at 10 000 characters; an over-cap element makes the engine refuse the whole drawing. Long docs render as several `Markdown` elements cut at blank lines outside code fences (`views/markdown-chunks.ts`); hunk clamping leaves room for its marker line.

## Next ideas

- Pinned header/file list with the engine's `ui.scroll` (the built-in diff mod's approach) for long diffs.
- Base selection (HEAD / merge-base with the default branch), per-turn diffs from `$.session.messages()`.
- `ExitPlanMode` plans into the Doc pane; a file-tree view; render `raven show` images via `Image`.
- Line-level comments (the `Code` element has no line hit-testing; would need a per-line Button layout).
- Publish: a release workflow that builds `dist/raven` per platform.

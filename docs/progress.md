# Raven progress log

Working title **Raven** (rename pending). Live-preview side pane for Claude Code built as a mod
(function-hooks plugin) plus a Bun CLI and skill.

## Resume here

Check `TaskList` / this log's latest entry, then continue with the next unchecked milestone.

## Milestones

- [ ] M0 smoke mod: /raven opens docked pane (Markdown, Code diff, Button, Input); bin/ on PATH; Bash stdout intercept; prompt.submit context; validate + plugin test
- [ ] M1 diff view: file list + per-hunk Code diff in one pane, refresh on Edit/Write/Bash
- [ ] M2 doc view: auto-show markdown written to plan/spec dirs (superpowers, ~/.claude/plans)
- [ ] M3 review comments: comment on file/hunk, ride next prompt / Send button
- [ ] M4 CLI + skill: `raven show|diff|comments`, directive bridge via Bash result intercept
- [ ] M5 simplify, review, validate, e2e

## Decisions

- 2026-09-29 Repo lives at ~/Work/projects/claude-mod (temporary); the name "raven" is one constant so a rename is mechanical.
- 2026-09-29 Mod layer owns everything in-session: UI, event reactions, prompt injection, state. The CLI is stateless: it is the agentic entry point Claude reaches through Bash and prints a directive the mod intercepts from the Bash tool result (no polling, no IPC). With function hooks off the CLI prints plain useful output instead.
- 2026-09-29 The compiled Bun binary is not committed: `bin/raven` is a shim that execs `dist/raven` when built, else `bun cli/src/main.ts`.
- 2026-09-29 Raven state stays out of the working tree (`$.store`), so it never shows up in its own diff pane.
- 2026-09-29 Only one pane shows at a time (others become tabs), so the file list and hunks share one pane. `Code` caps source at 10k chars: render per hunk.
- 2026-09-29 Superpowers writes specs/plans to docs/superpowers/{specs,plans}/ and working notes to .superpowers/; built-in plan mode writes ~/.claude/plans/.
- 2026-09-29 Weekly usage was at 87% at session start: verification prefers zero-token paths (slash commands, `claude plugin test`, shell edits) over live prompts.

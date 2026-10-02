---
name: preview
description: Show things to the user in the Raven preview pane beside the transcript — a rendered markdown document, a file, an inline summary, or the diff — and read the review comments they left on the diff or on a shown doc's sections. Use when the user asks to see, preview, open or render a plan, spec, doc or file; when you finish a plan or design they should read; when a visual explanation (a table, a checklist, a summary of changes) reads better rendered than in chat; or when the user mentions comments or review feedback on the diff or a doc.
---

# Raven preview pane

Raven docks a pane beside the transcript. It already reacts on its own: the diff refreshes as files
change, and markdown written under `docs/superpowers/` or `.superpowers/`, and plan mode's plan file,
open as they are written. Reach for the Raven `show` tool only for what it cannot see coming.

Prefer the Raven `show` tool when it is listed among your tools: call it with `op` (`show`, `note`,
`diff` or `comments`), and `path` / `markdown` / `title` as the op needs. A relative `path` resolves
against the session's working directory.

| Want | Call |
| --- | --- |
| Render a markdown file or show any file | `{ op: "show", path, title? }` |
| Render markdown you compose | `{ op: "note", markdown, title? }` |
| Open the diff, optionally at one file | `{ op: "diff", path? }` |
| Read the user's pending review comments | `{ op: "comments" }` |

When the tool is not listed (function hooks off, or an older Raven), fall back to the `raven` CLI: it
is on your PATH, prints one line the pane consumes, and the tool result tells you whether it was shown.

| Want | Run |
| --- | --- |
| Render a markdown file or show any file | `raven show <path> [--title "…"]` |
| Render markdown you compose | `raven note --title "…" <<'EOF'` … `EOF` |
| Open the diff, optionally at one file | `raven diff [<path>]` |
| Read the user's pending review comments | `raven comments` |

## When to use it

- The user asks to see, open, preview or render something: show it instead of pasting it into chat.
- You wrote a plan or spec outside the watched folders: `raven show` it so the user reads it rendered.
- A comparison, checklist or summary is easier to read rendered: compose it with `raven note` and keep
  the chat reply to one line pointing at the pane.
- You finished a batch of edits and want the user's eyes on one file: `raven diff <path>`.

## Review comments

The user can comment on files and hunks in the diff pane, and on sections of a markdown doc shown
in the pane. Pending comments ride their next prompt as hidden context headed as a review; treat
each as a requested change, address it, and say which ones you addressed. A doc comment groups by
path under `§ heading`; if the same heading appears more than once in the doc, a later group is
labelled `(2nd)`, `(3rd)`, and so on — address each the same way you address a diff comment.
`{ op: "comments" }` (or `raven comments`) fetches them on demand (and marks them delivered).

## When the result says the pane is not active

Raven's pane needs a wide fullscreen terminal, and (on older Claude Code, before mods loaded by
default) Claude Code's function hooks enabled (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`). If the result
says it was not shown, tell the user once and fall back to answering in chat; do not retry.

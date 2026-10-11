---
name: preview
description: Show things to the user in the Raven preview pane beside the transcript and collect their review. Use whenever you produce something the user should read, review or approve (a plan, spec, design, report or other doc, from any workflow; Raven may already have opened it, and a tool result says so), when the user asks to see, preview or render a file or doc, when a table, checklist or summary reads better rendered than in chat, or when the user mentions comments or review feedback on the diff or a doc.
---

# Raven preview pane

Raven docks a pane beside the transcript. Some things open there by themselves: the diff on your
first edit (it then refreshes as a live log), plan mode's plan file, and markdown written under a
watched folder. When that happens the tool result tells you so; don't show it again. Everything
else the user should read, you put there yourself.

Call the Raven `show` tool with `op` (`show`, `note`, `diff`, `comments` or `open`), and
`path` / `markdown` / `title` / `pane` as the op needs. A relative `path` resolves against the
session's working directory.

| Want | Call |
| --- | --- |
| Render a markdown file or show any file | `{ op: "show", path, title? }` |
| Render markdown you compose | `{ op: "note", markdown, title? }` |
| Open the diff, optionally at one file | `{ op: "diff", path? }` |
| Open a pane: the files list, tasks, doc or diff | `{ op: "open", pane }` (`files`, `tasks`, `doc`, `diff`) |
| Read the user's pending review comments | `{ op: "comments" }` |

When the tool is not among your tools (function hooks off, or an older Raven), fall back to the `raven` CLI: it
is on your PATH, prints one line the pane consumes, and the tool result tells you whether it was shown.

| Want | Run |
| --- | --- |
| Render a markdown file or show any file | `raven show <path> [--title "…"]` |
| Render markdown you compose | `raven note --title "…" <<'EOF'` … `EOF` |
| Open the diff, optionally at one file | `raven diff [<path>]` |
| Open a pane: the files list, tasks, doc or diff | `raven open <files\|tasks\|doc\|diff>` |
| Read the user's pending review comments | `raven comments` |

## When to use it

- The user asks to see, open, preview or render something: show it instead of pasting it into chat.
- The user asks for the file tree, the files list, the tasks, the doc or the diff: `raven open <pane>`
  (`files`, `tasks`, `doc`, `diff`) docks that pane, and a second call leaves it showing. Don't tell
  them only `/raven` can switch panes.
- You wrote a plan, spec, design or report the user should read, and no tool result said Raven
  already opened it: `show` it so the user reads it rendered.
- A comparison, checklist or summary is easier to read rendered: compose it with `raven note` and keep
  the chat reply to one line pointing at the pane.
- You finished a batch of edits and want the user's eyes on one file: `raven diff <path>`.

## Handing over for review

Once a doc the user should review or approve is in the pane (opened by itself or by you):

1. Keep the chat reply to one line pointing at the pane; don't paste the doc.
2. Ask with AskUserQuestion: "Looks good, proceed", "I'll comment in the pane", plus whatever
   decision the current workflow needs (an execution choice, a scope pick).
3. On "I'll comment in the pane", end your turn with one line asking them to leave notes on its
   sections and then reply (or press send). The question's dialog holds the keyboard, so they
   cannot type notes while it is open.
4. Their notes arrive with that reply. Address each one, update the doc (it reloads in place), say
   which you addressed, and ask again until they approve.

Plan mode's own plan is the exception: plan mode approves it through its own exit, so don't ask
with AskUserQuestion; notes the user leaves on it arrive with their next reply.

## Review comments

The user can comment on files and hunks in the diff pane, and on sections of a markdown doc shown
in the pane. Pending comments ride their next prompt (or their answer to your AskUserQuestion) as
hidden context headed as a review; treat
each as a requested change, address it, and say which ones you addressed. A doc comment groups by
path under `§ heading`; if the same heading appears more than once in the doc, a later group is
labelled `(2nd)`, `(3rd)`, and so on: address each the same way you address a diff comment.
`{ op: "comments" }` (or `raven comments`) fetches them on demand (and marks them delivered).

## When the result says the pane is not active

Raven's pane needs a wide fullscreen terminal, and (on Claude Code older than 2.1.287, before mods
loaded by default) Claude Code's function hooks enabled (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`). If
the result says it was not shown, tell the user once and fall back to answering in chat; do not
retry.

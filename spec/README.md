# Raven specs

Raven is a live preview pane for Claude Code: a dock beside the transcript that shows the session's
diff, the plans and docs Claude writes, and review comments the person leaves on a hunk. It ships as
one Claude Code plugin built from a deterministic **mod** (function hooks), a Bun **CLI**, and a
**skill**; [`architecture.md`](./architecture.md) is where that split, and why it exists, is
explained.

Read in this order. This README plus the eight specs below make up the full doc set:

1. **[architecture.md](./architecture.md)**: why Raven exists, the three layers, component
   boundaries, the `Host`/`View`/trigger/controller contracts, state ownership, naming, hot-reload
   adoption, and the review loop's shape. Start here.
2. **[mod-api.md](./mod-api.md)**: the Claude Code mod (function hooks) API as Raven depends on it:
   enabling it, plugin layout, the sandbox, types, the events Raven hooks, UI element caps, panes,
   the native diff panel, hot reload, and the test kit. Read this once you need to know what the
   engine actually guarantees, rather than what Raven builds on top of it.
3. **[agentic.md](./agentic.md)**: the `show` tool, the CLI's directive bridge, and the skill that
   tells Claude when to reach for either.
4. **[diff-pane.md](./diff-pane.md)** and **[review.md](./review.md)**: the diff pane itself:
   sources, hunks, staging and reverting, and the full review-comment lifecycle.
5. **[views.md](./views.md)**: the Doc, Files and Tasks views, plus the chrome shared across every
   view: the status band, the command row, pane tabs and `/raven` subcommands.
6. **[settings-and-surfaces.md](./settings-and-surfaces.md)**: the `/config` fields and how a view
   degrades on a surface whose element table is missing `Image`, `Input` or `Select`.
7. **[development.md](./development.md)**: building, testing, and the closed-loop tmux harness used
   to exercise a real session without spending model tokens on every check.

Each spec owns one concern; a concept explained in one lives there alone; every other doc that needs
it links back rather than restating it.

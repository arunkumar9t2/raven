# Review comments

Review comments let the person mark up the [diff pane](./diff-pane.md) — a note on a file, a hunk,
or one changed line — and have that note reach Claude on its own, without dictating it into the
prompt by hand. They exist so reviewing a change and acting on the review can happen in the same
place the diff is already open.

## Anchors and composing

A comment anchors to `{ path, hunk? }`: a bare path is a file-level comment, a path plus a hunk
header is scoped to that hunk (`plugins/raven/hooks/views/diff/anchor.ts`). Composing on a hunk
shows a line picker, on a surface with `canPick`: "whole hunk" plus one option per changed line
in that hunk, each labeled `Lnn -`/`+` its text and truncated to fit the pane
(`changedLinesOf` in `plugins/raven/hooks/review/comments.ts`, which walks the hunk body tracking
each side's real line numbers). The chosen line rides with the comment as
`{ number, side, text }`; a line-anchored note displays `Lnn` before its text.

Without `canType`, a surface draws no comment controls at all — no button, no compose box — while
an anchor's existing notes still show; without `canPick`, a hunk's compose box drops its line
picker, so every comment made there is a whole-hunk comment. The full surface capability table is
owned by [`settings-and-surfaces.md`](./settings-and-surfaces.md).

A comment whose hunk header no longer matches any of the file's current hunks — Claude edited past
it — moves into an "Outdated" group, grouped by the stale hunk header, rendered after the file's
live hunks under a dim title row. It stays fully usable there: removable, resendable, and it still
rides the next review send.

## Status

A comment's status moves `pending` → `sent` → `addressed` or `open`. A note row reads as a margin
annotation under its code, not a dialog of its own: a left accent bar `▎`
(`plugins/raven/hooks/ui/accent-bar.tsx`) coloured
by the status below (`NOTE_STATE_COLORS`), the comment's text, then dim `Lnn · age` and its chips
right-aligned — `▎ text ··· L12 · 2m [ resend ] [ ✕ ]`. No separate status glyph draws; the
accent bar's colour is the only status mark.

- **pending** — the accent bar reads `suggestion`-coloured; not yet sent, and the only status a
  header's "send N" count includes.
- **sent** — the accent bar dims to `inactive`, once it has ridden a prompt.
- **addressed** — the accent bar reads `success`-coloured, collapsed with every other addressed
  comment at the same anchor into one dim "✓ N addressed" row, once a resolution names it.
- **open** — the accent bar reads `warning`-coloured (the same colour as the `M` status mark), with
  a `[ resend ]` chip, once a main-loop turn finished without naming it. The chip is not scoped to
  the row it sits on: pressing resend on any one open comment moves every open comment back to
  `pending` — there is no per-comment resend, only a resend-all triggered from any open row. Every
  note row also carries a `[ ✕ ]` chip that removes it outright, regardless of status.

## Delivery

Every delivery path draws from the same pending set and consumes it: taking the pending comments
moves all of them to `sent` and formats them as review text in one step
(`reviewTextOf` in `plugins/raven/hooks/review/comments.ts`) — there is no way to preview a review
without also marking it sent.

- **Hidden context** — the next prompt the person sends through the composer or Remote Control (a
  `bridge` origin) carries the pending review as hidden context, appended in `prompt.submit`
  (`plugins/raven/hooks/register.ts`). A prompt from any other origin does not trigger this. When it
  does, Raven toasts "Raven: N review comments sent with this prompt" so the carry is never silent
  (`plugins/raven/hooks/core/raven.ts`).
- **Edit & send** — the header's plain "edit & send" button, shown alongside send whenever comments
  are pending (header order is [`diff-pane.md`](./diff-pane.md)'s concern), takes the same review
  text and fills the prompt box with it (`$.prompt.fill`, replacing the draft) so the person can
  edit before pressing Enter. When the box refuses the fill — no composer in this session, or a
  dialog holds the keyboard — the comments return to `pending` and a toast names the reason.
- **Send** — the header's "send N" button, or `/raven send`, submits the review as a *visible*
  prompt (`$.prompt.submit`) instead of hidden context, so the person sees exactly what Claude was
  asked.
- **The `show` tool's `comments` op** — `raven comments` (or the directive form) answers with the
  same taken review text as the tool result, which is how it reaches Claude when the CLI or a
  directive asks for it rather than a prompt.

## Resolution

Once a main-loop turn — not a subagent's own turn — finishes answering with comments in `sent`,
Raven forks the session once with a prompt listing that batch's comments as `[id] path Lnn: text`
(`plugins/raven/hooks/review/resolve.ts`) and asking for a JSON array of the ids it addressed. The
batch of ids is captured before the fork starts, so a newer comment sent while that fork is still
in flight is untouched by whatever comes back for the earlier batch. A named id becomes
`addressed`; every other id in that same batch becomes `open` — including every id in the batch
when the reply names none of them, whether because it genuinely addressed nothing or because its
array didn't parse into any id from that batch. Only a reply with no bracketed array in it at all
is treated as a failed round-trip rather than an answer, leaving the whole batch `sent`, as does a
rejected fork call, which is caught and logged rather than surfaced. Only one fork resolves at a
time: a turn that finishes while an earlier fork is still in flight does not queue a second one,
and a batch left `sent` — a dropped or rejected fork, or a reply that named nothing — is picked up
again the next time a main-loop turn finishes with sent comments still outstanding, so it can be
forked more than once over its lifetime before it resolves.

## Status line and clear

Raven's status line (`$.ui.status`) reads "N review comments pending" whenever the pending count
changes, and is cleared once it reaches zero. The header's plain "clear" button asks for
confirmation: the first press relabels it "clear all? press again", shown at full strength (no
colour change — `Button` has no colour prop); the second drops every comment regardless of status. Any other action anywhere in the pane — selecting a file, staging a hunk,
opening another comment box, even a background refresh — resets that armed state before it fires.

## Persistence

Comments live in memory for the running session and are written to `$.store`, keyed by the
repository's toplevel path, on every mutation. Raven reads them back the first time a repository is
seen in a session, so a restarted session or a hot-reloaded module picks the stored set back up
mid-cycle at whatever status each comment was left in: a `pending` comment rides the next composer
or bridge prompt as usual, and a `sent` batch left over from before a restart is swept into the next
resolution fork exactly as a batch sent in the current session would be. Only the "resend" control
moves a comment back to `pending` on its own; nothing else does. Comments never touch the working
tree, so they never appear in the diff they annotate.

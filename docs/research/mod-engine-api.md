# Mod engine API: tools, commands, prompt, state (CC 2.1.283)

- `$.tool.register({name, description, inputSchema?})` → model calls `mcp__<plugin>__<name>`; answer via `on('tool.call', {tool:'mcp__<plugin>__<name>'}, …)`. Rejects before session.start binds.
- `tool.call` result union: `{deny}` | `{result, text?, context?}` | `{isError:true, result, text?}`. Bash input `{command, …}`; Bash result `{stdout, stderr, interrupted, …}`. A hook can rewrite `text` (what the model reads).
- `command.register({name, description, argumentHint?, immediate?})`; `command.run` input `{command, args, origin, presentation:{isFullscreen, columns}}` → `{text?, context?}`.
- Inject hidden text into the next turn: `prompt.submit` → `next({...e, context:[...(e.context??[]), text]})`. `prompt.context`/`prompt.section` rewrite fixed blocks only.
- `$.store.get/set/delete/keys` — per-plugin JSON, persists across sessions. `$.fs.read/write/list/exists/stat/ancestors` — no watch. `$.clock.after/every/now/sleep`. `$.process.run(argv, {cwd, env, stdin, timeoutMs})` → `{exitCode, stdout, stderr}` (no shell). `$.http.fetch`. `$.session.cwd/root/repo/id/messages/usage`. `$.plugin.{name, root}`.
- `register(on, options)`; `on(pattern, matcher?, ($, e, next) => …)`; matchers: literal/RegExp/array/partial object. `next.signal`, `next.origin`.
- `session.start` input `{cwd, surface, isInteractive}`.

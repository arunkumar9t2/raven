# Mod packaging, typing, testing (CC 2.1.283)

- Enable: `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` (early access, no official docs page; types header is the authority).
- `hooks/hooks.json`: `{ "description": "...", "modules": ["./register.ts"] }`. Mixing classic hook keys in the same file is unverified.
- `bin/` in a plugin is on the Bash tool's PATH while enabled (plugin becomes ineligible for claude.ai/Cowork org sync).
- Env: `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` (~/.claude/plugins/data/<id>/), `${CLAUDE_PROJECT_DIR}` — substituted in hook commands / skill markdown, NOT exported to the Bash tool.
- Types: `/plugin-types` (in-session) writes `.claude/types/claude-code.d.ts`; `import type … from 'claude-code'` is types-only. tsconfig: es2023, bundler resolution, `jsx: react`, `jsxFactory: h`, `jsxFragmentFactory: Fragment`, include types dir + hooks + tests.
- Module runtime: own sandbox, no DOM, no Node, no require. Relative imports of .ts/.tsx/.js… only; no JSON imports; npm deps unverified → keep the mod dependency-free. Globals: URL, TextEncoder, AbortController, crypto.subtle, h, Fragment. Files under plugin root via `$.fs.read(`${$.plugin.root}/…`)`.
- Tests: `claude plugin test <dir>` (needs the env var). Kit `claude-code/testing`: describe/test/expect/mock/tier; `mock.env|store|clock(on)`; tests run with no fs/network/process — answer every `$` call via `on(...)`.
- Validate: `claude plugin validate <path> [--strict] [--json]` — also statically analyses the hooks module (what it hooks/calls, what the engine would refuse).
